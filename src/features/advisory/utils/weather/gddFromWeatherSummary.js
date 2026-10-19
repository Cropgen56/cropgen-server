import {
  calculateCumulativeGDD,
  calculateDailyGDD,
  getCropGrowthStage,
} from "../../../../utils/crop/growth/gddCalculator.js";
import { GDD_MAX_TEMP_CAP_C } from "../../cropGrowthStage/index.js";
import { formatDateISO } from "../shared/helpers.js";

function daysBetween(startISO, endISO) {
  const start = new Date(startISO);
  const end = new Date(endISO);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
  return Math.max(0, Math.floor((end - start) / 86400000));
}

/**
 * Build temp max/min samples from current conditions + 7-day forecast.
 */
function collectTemperatureSamples(weatherSummary) {
  const samples = [];
  const current = weatherSummary?.current || {};
  const next7 = weatherSummary?.next7Days || {};

  if (current.temp != null && Number.isFinite(Number(current.temp))) {
    const t = Number(current.temp);
    samples.push({
      tmax: Number(current.apparent_temperature_max) || t + 3,
      tmin: Number(current.apparent_temperature_min) || t - 3,
    });
  }

  const len = Math.min(
    next7.tempMax?.length || 0,
    next7.tempMin?.length || 0,
    7,
  );
  for (let i = 0; i < len; i++) {
    const tmax = Number(next7.tempMax[i]);
    const tmin = Number(next7.tempMin[i]);
    if (Number.isFinite(tmax) && Number.isFinite(tmin)) {
      samples.push({ tmax, tmin });
    }
  }

  if (!samples.length && Array.isArray(next7.tempMean)) {
    for (const mean of next7.tempMean.slice(0, 7)) {
      const m = Number(mean);
      if (Number.isFinite(m)) {
        samples.push({ tmax: m + 4, tmin: m - 4 });
      }
    }
  }

  return samples;
}

/**
 * When Observearth historical fails: estimate cumulative GDD using
 * average daily GDD from current + forecast × days since sowing.
 */
export function estimateGDDFromCurrentAndForecast(
  weatherSummary,
  baseTemp,
  sowingDateISO,
  endDateISO = formatDateISO(new Date()),
) {
  const sowing = new Date(sowingDateISO);
  const end = new Date(endDateISO);

  if (sowing > end) {
    return {
      gddSeries: [],
      cumulativeGDD: 0,
      source: "current_forecast_estimate",
      method: "future_sowing_date",
      daysSinceSowing: 0,
      avgDailyGDD: 0,
      sampleCount: 0,
    };
  }

  const daysSinceSowing = daysBetween(sowingDateISO, endDateISO);
  if (daysSinceSowing === 0) {
    return {
      gddSeries: [{ date: endDateISO, dailyGDD: 0, cumulativeGDD: 0 }],
      cumulativeGDD: 0,
      source: "current_forecast_estimate",
      method: "sowing_day",
      daysSinceSowing: 0,
      avgDailyGDD: 0,
      sampleCount: 0,
    };
  }

  const samples = collectTemperatureSamples(weatherSummary);
  if (!samples.length) {
    return {
      gddSeries: [],
      cumulativeGDD: 0,
      source: "current_forecast_estimate",
      method: "no_temperature_data",
      daysSinceSowing,
      avgDailyGDD: 0,
      sampleCount: 0,
    };
  }

  const dailyGdds = samples.map((s) =>
    calculateDailyGDD(s.tmax, s.tmin, baseTemp, { maxTempCap: GDD_MAX_TEMP_CAP_C }),
  );
  const avgDailyGDD =
    dailyGdds.reduce((sum, v) => sum + v, 0) / dailyGdds.length;

  const gddSeries = [];
  let cumulative = 0;
  for (let d = 0; d < daysSinceSowing; d++) {
    const date = new Date(sowing);
    date.setDate(date.getDate() + d);
    cumulative += avgDailyGDD;
    gddSeries.push({
      date: formatDateISO(date),
      dailyGDD: Number(avgDailyGDD.toFixed(2)),
      cumulativeGDD: Number(cumulative.toFixed(1)),
    });
  }

  return {
    gddSeries,
    cumulativeGDD: gddSeries.at(-1)?.cumulativeGDD ?? 0,
    source: "current_forecast_estimate",
    method: "avg_daily_gdd_from_current_and_forecast",
    daysSinceSowing,
    avgDailyGDD: Number(avgDailyGDD.toFixed(2)),
    sampleCount: samples.length,
  };
}

/**
 * Prefer historical daily series; fall back to current + forecast estimate.
 */
export function resolveGDDAndGrowthStage({
  historicalWeather,
  weatherSummary,
  baseTemp,
  sowingDateISO,
  cropName,
  ndvi = null,
  endDateISO = formatDateISO(new Date()),
}) {
  const historicalSeries = calculateCumulativeGDD(
    historicalWeather,
    baseTemp,
    sowingDateISO,
    { maxTempCap: GDD_MAX_TEMP_CAP_C },
  );

  let gddSeries = [];
  let gddSource = "historical";
  let gddMeta = { method: "observearth_historical" };

  if (historicalSeries?.length) {
    gddSeries = historicalSeries;
  } else {
    const estimate = estimateGDDFromCurrentAndForecast(
      weatherSummary,
      baseTemp,
      sowingDateISO,
      endDateISO,
    );
    gddSeries = estimate.gddSeries;
    gddSource = estimate.source;
    gddMeta = estimate;
  }

  const cumulativeGDD = gddSeries.at(-1)?.cumulativeGDD ?? 0;
  const plantGrowthActivity = {
    ...getCropGrowthStage(cropName, cumulativeGDD, ndvi),
    cumulativeGDD,
    gddSource,
  };

  return {
    gddSeries,
    cumulativeGDD,
    plantGrowthActivity,
    gddSource,
    gddMeta,
  };
}

/**
 * For cron worker: resolve current cumulative GDD with same fallback.
 */
export async function resolveCumulativeGDDForFarm({
  aoiId,
  historicalWeather,
  sowingDateISO,
  baseTemp,
  cropName,
  getCurrentWeather,
  getForecastWeather,
  assembleWeatherSummary,
}) {
  const endDateISO = formatDateISO(new Date());
  const historicalSeries = calculateCumulativeGDD(
    historicalWeather,
    baseTemp,
    sowingDateISO,
    { maxTempCap: GDD_MAX_TEMP_CAP_C },
  );

  if (historicalSeries?.length) {
    return {
      cumulativeGDD: historicalSeries.at(-1)?.cumulativeGDD || 0,
      gddSource: "historical",
      gddMeta: { method: "observearth_historical" },
    };
  }

  const [currentWeatherResp, forecastWeather] = await Promise.all([
    getCurrentWeather(aoiId),
    getForecastWeather(aoiId),
  ]);
  const weatherSummary = assembleWeatherSummary(
    currentWeatherResp,
    forecastWeather,
  );
  const estimate = estimateGDDFromCurrentAndForecast(
    weatherSummary,
    baseTemp,
    sowingDateISO,
    endDateISO,
  );

  return {
    cumulativeGDD: estimate.cumulativeGDD,
    gddSource: estimate.source,
    gddMeta: estimate,
  };
}
