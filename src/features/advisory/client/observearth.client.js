import axios from "axios";
import { log } from "../../../utils/logger.js";

const OBSERVEARTH_BASE = "https://observearth.com/api/weather";

const CURRENT_FORECAST_TIMEOUT_MS =
  Number(process.env.OBSERVEARTH_CURRENT_TIMEOUT_MS) || 15_000;
/** Historical endpoint often hangs on Observearth — fail fast per request */
const HISTORICAL_TIMEOUT_MS =
  Number(process.env.OBSERVEARTH_HISTORICAL_TIMEOUT_MS) || 12_000;
const HISTORICAL_MAX_TOTAL_MS =
  Number(process.env.OBSERVEARTH_HISTORICAL_MAX_MS) || 25_000;

const observearthHttp = axios.create({
  timeout: CURRENT_FORECAST_TIMEOUT_MS,
});

function getObservearthHeaders() {
  const apiKey = process.env.OBSERVEARTH_API_KEY;
  const csrf = process.env.OBSERVEARTH_CSRF || "";
  if (!apiKey) {
    console.warn("[Observearth] OBSERVEARTH_API_KEY is missing");
  }
  const headers = {
    accept: "application/json",
    "x-api-key": apiKey,
  };
  if (csrf) headers["X-CSRFTOKEN"] = csrf;
  return headers;
}

export async function getCurrentWeather(geometryId) {
  const url = `${OBSERVEARTH_BASE}/current/?geometry_id=${geometryId}`;
  const { data } = await observearthHttp.get(url, {
    headers: getObservearthHeaders(),
  });
  return data;
}

export async function getForecastWeather(geometryId) {
  const url = `${OBSERVEARTH_BASE}/forecast/?geometry_id=${geometryId}`;
  const { data } = await observearthHttp.get(url, {
    headers: getObservearthHeaders(),
  });
  return data;
}

export async function getHistoricalWeather(
  geometryId,
  startDate,
  endDate,
  timeoutMs = HISTORICAL_TIMEOUT_MS,
) {
  const url = `${OBSERVEARTH_BASE}/historical/?geometry_id=${geometryId}&start_date=${startDate}&end_date=${endDate}`;
  const { data } = await observearthHttp.get(url, {
    headers: getObservearthHeaders(),
    timeout: timeoutMs,
  });
  return data;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function isRetryableObservearthError(err) {
  const status = err?.response?.status;
  if (status === 403 || status === 404) return false;
  if (err?.code === "ECONNABORTED" || err?.message?.includes("timeout")) {
    return false;
  }
  return status === 429 || status === 500 || status === 502 || status === 503;
}

function formatObservearthError(err) {
  if (err?.response?.status === 403) {
    return "Observearth permission denied for this geometry";
  }
  if (err?.code === "ECONNABORTED") {
    return `Observearth historical timeout (${HISTORICAL_TIMEOUT_MS}ms)`;
  }
  return err?.response?.data?.detail || err?.message || String(err);
}

function hasDailyWeatherSeries(data) {
  return Array.isArray(data?.daily?.time) && data.daily.time.length > 0;
}

/**
 * Fetch current + forecast in parallel, then historical via short windows first.
 * Avoids full sowing→today range (Observearth often hangs on long historical queries).
 */
export async function fetchWeatherBundle(
  geometryId,
  startDate,
  endDate,
  { preferShortWindows = false, onProgress } = {},
) {
  const log = (msg) => onProgress?.(msg);

  log("current + forecast");
  let currentWeatherResp = null;
  let forecastWeather = null;
  const currentForecastStart = Date.now();

  const [currentSettled, forecastSettled] = await Promise.allSettled([
    getCurrentWeather(geometryId),
    getForecastWeather(geometryId),
  ]);

  if (currentSettled.status === "fulfilled") {
    currentWeatherResp = currentSettled.value;
  } else {
    console.warn(
      "[Observearth] Current weather failed:",
      formatObservearthError(currentSettled.reason),
    );
  }

  if (forecastSettled.status === "fulfilled") {
    forecastWeather = forecastSettled.value;
  } else {
    console.warn(
      "[Observearth] Forecast weather failed:",
      formatObservearthError(forecastSettled.reason),
    );
  }

  log(
    `current/forecast done in ${Date.now() - currentForecastStart}ms (current: ${currentSettled.status}, forecast: ${forecastSettled.status})`,
  );

  const historicalResult = await getHistoricalWeatherWithFallback(
    geometryId,
    startDate,
    endDate,
    { preferShortWindows, onProgress: log },
  );

  return {
    currentWeatherResp,
    forecastWeather,
    historicalWeather: historicalResult.data,
    historicalError: historicalResult.error,
    historicalWindowDays: historicalResult.windowDays,
  };
}

/**
 * Short windows first; never blocks on full sowing→today (that endpoint hangs).
 */
export async function getHistoricalWeatherWithFallback(
  geometryId,
  startDate,
  endDate,
  { preferShortWindows = false, onProgress } = {},
) {
  const windowDaysList = preferShortWindows
    ? [1, 3, 7]
    : [1, 3, 7, 14, 30];

  let lastError = null;
  const startedAt = Date.now();

  for (const windowDays of windowDaysList) {
    if (Date.now() - startedAt > HISTORICAL_MAX_TOTAL_MS) {
      console.warn(
        `[Observearth] Historical fetch budget exceeded (${HISTORICAL_MAX_TOTAL_MS}ms) for ${geometryId}`,
      );
      break;
    }

    let rangeStart = startDate;
    if (windowDays != null) {
      const start = new Date(endDate);
      start.setDate(start.getDate() - windowDays);
      rangeStart = start.toISOString().slice(0, 10);
    }

    onProgress?.(`historical ${windowDays}d (${rangeStart}→${endDate})`);

    try {
      const data = await getHistoricalWeather(
        geometryId,
        rangeStart,
        endDate,
        HISTORICAL_TIMEOUT_MS,
      );
      if (hasDailyWeatherSeries(data)) {
        log.info(
          `[Observearth] Historical OK (${windowDays}d: ${rangeStart}→${endDate}) in ${Date.now() - startedAt}ms`,
        );
        return {
          data,
          startDate: rangeStart,
          endDate,
          windowDays,
          error: null,
        };
      }
      lastError = new Error("Observearth returned empty daily time series");
    } catch (err) {
      lastError = err;
      const msg = formatObservearthError(err);
      console.warn(
        `[Observearth] Historical ${windowDays}d failed for ${geometryId}: ${msg}`,
      );
      if (isRetryableObservearthError(err)) {
        await sleep(800);
        try {
          const data = await getHistoricalWeather(
            geometryId,
            rangeStart,
            endDate,
            HISTORICAL_TIMEOUT_MS,
          );
          if (hasDailyWeatherSeries(data)) {
            return {
              data,
              startDate: rangeStart,
              endDate,
              windowDays,
              error: null,
            };
          }
        } catch (retryErr) {
          lastError = retryErr;
        }
      }
    }
  }

  return {
    data: null,
    startDate,
    endDate,
    windowDays: null,
    error: lastError,
  };
}
