import { fetchWeatherBundle } from "../client/observearth.client.js";
import {
  assembleWeatherSummary,
  buildWeatherSnapshot,
} from "../utils/weather/weatherSnapshot.utils.js";
import { MODULE_IDS } from "../pipeline/constants.js";
import { moduleResult } from "../pipeline/moduleResult.js";

function buildWeatherSuggestion(weatherSummary) {
  const rainfall = weatherSummary?.next7Days?.rainfall || [];
  const rainfallForecast3dMm = rainfall
    .slice(0, 3)
    .reduce((s, v) => s + (Number(v) || 0), 0);
  const rainfallForecast7dMm = rainfall.reduce(
    (s, v) => s + (Number(v) || 0),
    0,
  );
  const rainNext24h = Number(rainfall[0]) || 0;
  const rainProbabilityToday =
    rainNext24h >= 8 ? "high" : rainNext24h >= 2 ? "moderate" : "low";

  let advisoryText = "No major rain risk in the next few days.";
  if (rainfallForecast3dMm >= 25) {
    advisoryText = `Heavy rain expected (~${Math.round(rainfallForecast3dMm)} mm in 3 days) - delay spray and review irrigation.`;
  } else if (rainfallForecast3dMm >= 8) {
    advisoryText = `Light to moderate rain (~${Math.round(rainfallForecast3dMm)} mm in 3 days).`;
  }

  const severeAlert =
    rainfallForecast3dMm >= 40 ||
    (weatherSummary?.next7Days?.tempMax?.[0] ?? 0) >= 42 ||
    (weatherSummary?.next7Days?.tempMin?.[0] ?? 99) <= 5;

  return {
    rainProbabilityToday,
    rainfallForecast3dMm,
    rainfallForecast7dMm,
    advisoryText,
    severeAlert,
  };
}

/**
 * Short reason for a failed Observearth call, e.g. "429", "503 Rate limiting
 * failed. Redis unavailable.", "OBSERVEARTH_COOLDOWN", "timeout".
 */
export function describeWeatherError(err) {
  if (!err) return "no data";
  const status = err.response?.status;
  if (status) {
    const data = err.response?.data;
    const detail =
      (typeof data === "object" && (data?.detail || data?.error)) ||
      (typeof data === "string" ? data : "");
    return detail ? `${status} ${String(detail).slice(0, 80)}` : String(status);
  }
  if (err.code === "OBSERVEARTH_COOLDOWN") return "OBSERVEARTH_COOLDOWN";
  if (err.code === "ECONNABORTED" || /timeout/i.test(err.message || "")) {
    return "timeout";
  }
  return err.code || err.message || String(err);
}

export async function runWeatherSuggestionModule(ctx) {
  const warnings = [];
  const errors = [];

  try {
    if (ctx.mode === "barren") {
      const { getCurrentWeather, getForecastWeather } = await import(
        "../client/observearth.client.js"
      );
      const [currentSettled, forecastSettled] = await Promise.allSettled([
        getCurrentWeather(ctx.geometryId),
        getForecastWeather(ctx.geometryId),
      ]);

      const currentWeatherResp =
        currentSettled.status === "fulfilled" ? currentSettled.value : null;
      const forecastWeather =
        forecastSettled.status === "fulfilled" ? forecastSettled.value : null;

      if (!currentWeatherResp && !forecastWeather) {
        errors.push(
          `Weather unavailable for barren land advisory (current: ${describeWeatherError(currentSettled.reason)}; forecast: ${describeWeatherError(forecastSettled.reason)})`,
        );
        return moduleResult(MODULE_IDS.WEATHER, null, { errors });
      }

      if (currentSettled.status === "rejected") {
        warnings.push(`current weather: ${currentSettled.reason?.message}`);
      }
      if (forecastSettled.status === "rejected") {
        warnings.push(`forecast weather: ${forecastSettled.reason?.message}`);
      }

      const weatherSummary = assembleWeatherSummary(
        currentWeatherResp,
        forecastWeather,
      );
      const weatherSnapshot = buildWeatherSnapshot(weatherSummary);
      const weatherSuggestion = buildWeatherSuggestion(weatherSummary);

      ctx.logStep("weather module (barren): current + forecast loaded");
      return moduleResult(
        MODULE_IDS.WEATHER,
        {
          weatherSummary,
          weatherSnapshot,
          weatherSuggestion,
          historicalWeather: null,
          historicalWeatherError: null,
        },
        { warnings },
      );
    }

    ctx.logStep("weather module: fetching Observearth bundle");
    const weatherBundle = await fetchWeatherBundle(
      ctx.geometryId,
      ctx.sowingDateISO,
      ctx.nowISO,
      {
        preferShortWindows: ctx.preferShortHistoricalWindow,
        onProgress: (msg) => ctx.logStep(`weather: ${msg}`),
      },
    );

    const historicalWeatherError = weatherBundle.historicalError
      ? weatherBundle.historicalError?.message ||
        String(weatherBundle.historicalError)
      : null;

    if (!weatherBundle.historicalWeather && historicalWeatherError) {
      warnings.push(
        `historical unavailable - GDD may use estimate: ${historicalWeatherError}`,
      );
    }

    const weatherSummary = assembleWeatherSummary(
      weatherBundle.currentWeatherResp,
      weatherBundle.forecastWeather,
    );
    const weatherSnapshot = buildWeatherSnapshot(weatherSummary);
    const weatherSuggestion = buildWeatherSuggestion(weatherSummary);

    ctx.logStep("weather module: bundle loaded");
    return moduleResult(
      MODULE_IDS.WEATHER,
      {
        weatherSummary,
        weatherSnapshot,
        weatherSuggestion,
        historicalWeather: weatherBundle.historicalWeather,
        historicalWeatherError,
        historicalWindowDays: weatherBundle.historicalWindowDays ?? null,
      },
      { warnings },
    );
  } catch (err) {
    errors.push(err?.message || String(err));
    return moduleResult(MODULE_IDS.WEATHER, null, { errors });
  }
}
