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

/** Default pause after a 429/503 when Observearth sends no Retry-After header */
const RATE_LIMIT_COOLDOWN_MS =
  Number(process.env.OBSERVEARTH_RATE_LIMIT_COOLDOWN_MS) || 60_000;
const MAX_RATE_LIMIT_COOLDOWN_MS = 10 * 60_000;


/**
 * Process-wide circuit breaker: after Observearth answers 429 or 503, all
 * Observearth calls fail fast (no network) until the cooldown ends, so one
 * rate-limited farm doesn't make every other farm hit the limit too.
 */
let cooldownUntil = 0;

function isRateLimitStatus(status) {
  return status === 429 || status === 503;
}

function parseRetryAfterMs(headerValue) {
  if (headerValue == null || headerValue === "") return null;
  const seconds = Number(headerValue);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const dateMs = Date.parse(headerValue);
  if (Number.isFinite(dateMs)) return Math.max(0, dateMs - Date.now());
  return null;
}

function startCooldown(err) {
  const retryAfterMs = parseRetryAfterMs(err?.response?.headers?.["retry-after"]);
  const ms = Math.min(
    retryAfterMs ?? RATE_LIMIT_COOLDOWN_MS,
    MAX_RATE_LIMIT_COOLDOWN_MS,
  );
  const now = Date.now();
  const until = now + ms;
  if (until > cooldownUntil) {
    const wasCooling = now < cooldownUntil;
    cooldownUntil = until;
    if (!wasCooling) {
      console.warn(
        `[Observearth] ${err.response.status} received — pausing Observearth calls for ${Math.round(ms / 1000)}s`,
      );
    }
  }
}

export function getObservearthCooldownRemainingMs() {
  return Math.max(0, cooldownUntil - Date.now());
}

/** Test helper */
export function resetObservearthCooldown() {
  cooldownUntil = 0;
}

function cooldownError() {
  const err = new Error(
    `Observearth paused after rate limit (${Math.ceil(getObservearthCooldownRemainingMs() / 1000)}s left)`,
  );
  err.code = "OBSERVEARTH_COOLDOWN";
  return err;
}

async function observearthGet(url, config) {
  if (getObservearthCooldownRemainingMs() > 0) throw cooldownError();
  try {
    return await observearthHttp.get(url, config);
  } catch (err) {
    if (isRateLimitStatus(err?.response?.status)) startCooldown(err);
    throw err;
  }
}


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
  const { data } = await observearthGet(url, {
    headers: getObservearthHeaders(),
  });
  return data;
}

export async function getForecastWeather(geometryId) {
  const url = `${OBSERVEARTH_BASE}/forecast/?geometry_id=${geometryId}`;
  const { data } = await observearthGet(url, {
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
  const { data } = await observearthGet(url, {
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

function isRateLimitOrCooldown(err) {
  return (
    err?.code === "OBSERVEARTH_COOLDOWN" ||
    isRateLimitStatus(err?.response?.status)
  );
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

const SEASON_MAX_DAYS = Number(process.env.ADVISORY_HISTORY_MAX_DAYS) || 180;
const SEASON_MIN_DAYS = 14;
const SEASON_CHUNK_DAYS = Number(process.env.OBSERVEARTH_HISTORICAL_CHUNK_DAYS) || 30;
const SEASON_CONCURRENCY = 2;
const SEASON_MAX_TOTAL_MS = Number(process.env.OBSERVEARTH_HISTORICAL_SEASON_MAX_MS) || 45_000;

function isoAddDays(iso, days) {
  const d = new Date(`${String(iso).slice(0, 10)}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function isoDiffDays(aISO, bISO) {
  return Math.round(
    (new Date(`${String(bISO).slice(0, 10)}T12:00:00Z`) - new Date(`${String(aISO).slice(0, 10)}T12:00:00Z`)) / 86400000,
  );
}

/**
 * Merge several Observearth historical payloads ({ daily: { time: [], <field>: [] } })
 * into one, sorted by date, de-duplicated. Exported for tests.
 */
export function mergeDailyPayloads(payloads) {
  const valid = (payloads || []).filter(hasDailyWeatherSeries);
  if (!valid.length) return null;
  const fields = new Set();
  for (const p of valid) {
    for (const [k, v] of Object.entries(p.daily)) {
      if (k !== "time" && Array.isArray(v)) fields.add(k);
    }
  }
  const byDate = new Map();
  for (const p of valid) {
    p.daily.time.forEach((t, i) => {
      const date = String(t).slice(0, 10);
      const row = byDate.get(date) || {};
      for (const f of fields) {
        const arr = p.daily[f];
        if (Array.isArray(arr) && i < arr.length && arr[i] !== null && arr[i] !== undefined) row[f] = arr[i];
      }
      byDate.set(date, row);
    });
  }
  const dates = [...byDate.keys()].sort();
  const daily = { time: dates };
  for (const f of fields) daily[f] = dates.map((d) => (byDate.get(d)[f] ?? null));
  return { ...valid[0], daily };
}

/**
 * Whole-season history (sowing → today, capped at ADVISORY_HISTORY_MAX_DAYS)
 * fetched as parallel 30-day chunks, so one slow request cannot block the rest.
 * Returns { data, startDate, endDate, windowDays, partial } or null if every chunk failed.
 */
async function getSeasonHistoricalWeather(geometryId, startDate, endDate, { maxDays, onProgress } = {}) {
  const end = String(endDate).slice(0, 10);
  const earliest = isoAddDays(end, -(maxDays || SEASON_MAX_DAYS));
  const latestStart = isoAddDays(end, -SEASON_MIN_DAYS);
  let start = String(startDate || latestStart).slice(0, 10);
  if (start < earliest) start = earliest;
  if (start > latestStart) start = latestStart;

  const chunks = [];
  for (let from = start; from <= end; from = isoAddDays(from, SEASON_CHUNK_DAYS)) {
    const to = isoAddDays(from, SEASON_CHUNK_DAYS - 1);
    chunks.push([from, to > end ? end : to]);
  }
  onProgress?.(`historical season ${start}→${end} in ${chunks.length} chunk(s)`);

  const startedAt = Date.now();
  const results = new Array(chunks.length).fill(null);
  let next = 0;
  let rateLimited = false;
  async function worker() {
    while (next < chunks.length) {
      const idx = next++;
      if (rateLimited || Date.now() - startedAt > SEASON_MAX_TOTAL_MS) return;
      const [from, to] = chunks[idx];
      try {
        const data = await getHistoricalWeather(geometryId, from, to, HISTORICAL_TIMEOUT_MS);
        if (hasDailyWeatherSeries(data)) results[idx] = data;
      } catch (err) {
        if (isRateLimitOrCooldown(err)) {
          rateLimited = true; // stop fetching more chunks
        } else if (isRetryableObservearthError(err)) {
          // Transient 500/502: retry this chunk once after a short pause.
          await sleep(800);
          try {
            const data = await getHistoricalWeather(geometryId, from, to, HISTORICAL_TIMEOUT_MS);
            if (hasDailyWeatherSeries(data)) results[idx] = data;
          } catch (retryErr) {
            if (isRateLimitOrCooldown(retryErr)) rateLimited = true;
            console.warn(`[Observearth] Historical chunk ${from}→${to} failed after retry for ${geometryId}: ${formatObservearthError(retryErr)}`);
          }
        } else {
          console.warn(`[Observearth] Historical chunk ${from}→${to} failed for ${geometryId}: ${formatObservearthError(err)}`);
        }
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(SEASON_CONCURRENCY, chunks.length) }, worker));

  const merged = mergeDailyPayloads(results);
  if (!merged) return null;
  const okChunks = results.filter(Boolean).length;
  const first = merged.daily.time[0];
  log.info(
    `[Observearth] Historical season OK (${okChunks}/${chunks.length} chunks, ${merged.daily.time.length} days) in ${Date.now() - startedAt}ms`,
  );
  return {
    data: merged,
    startDate: first,
    endDate: end,
    windowDays: isoDiffDays(first, end),
    partial: okChunks < chunks.length,
  };
}

/**
 * Season history first (needed for correct GDD and recent disease weather);
 * falls back to short windows only if every season chunk failed.
 * `preferShortWindows` (new fields) limits the season fetch to the last 14 days.
 */
export async function getHistoricalWeatherWithFallback(
  geometryId,
  startDate,
  endDate,
  { preferShortWindows = false, onProgress } = {},
) {
  const season = await getSeasonHistoricalWeather(geometryId, startDate, endDate, {
    maxDays: preferShortWindows ? SEASON_MIN_DAYS : SEASON_MAX_DAYS,
    onProgress,
  });
  if (season) {
    return { ...season, error: null };
  }

  // Fallback: largest short window that works (was: the first, usually 1 day).
  const windowDaysList = preferShortWindows ? [7, 3, 1] : [30, 14, 7, 3, 1];

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
      if (isRateLimitOrCooldown(err)) {
        // Other windows would hit the same limit — stop here.
        console.warn(
          `[Observearth] Historical skipped for ${geometryId}: ${formatObservearthError(err)}`,
        );
        break;
      }
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
          if (isRateLimitOrCooldown(retryErr)) break;
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
