/**
 * Compact weather snapshots for advisory scheduling and change detection.
 */

export const WEATHER_CHANGE_THRESHOLDS = {
  tempDeltaC: 4,
  humidityDeltaPct: 20,
  rainfall3dDeltaMm: 20,
  heavyRain3dMm: 25,
  lightRain3dMm: 5,
  rainDaySpikeMm: 15,
  heavyRainDayMm: 25,
  forecastTempSwingC: 6,
  windGustAlertKmh: 50,
  windGustIncreaseKmh: 15,
};

function toNum(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function sumSlice(arr, count) {
  if (!Array.isArray(arr) || !arr.length) return 0;
  return arr.slice(0, count).reduce((sum, v) => sum + (Number(v) || 0), 0);
}

function maxSlice(arr, count) {
  if (!Array.isArray(arr) || !arr.length) return null;
  const values = arr.slice(0, count).map((v) => Number(v)).filter(Number.isFinite);
  return values.length ? Math.max(...values) : null;
}

function minSlice(arr, count) {
  if (!Array.isArray(arr) || !arr.length) return null;
  const values = arr.slice(0, count).map((v) => Number(v)).filter(Number.isFinite);
  return values.length ? Math.min(...values) : null;
}

function absDelta(a, b) {
  if (a == null || b == null) return null;
  return Math.abs(a - b);
}

/**
 * Normalize Observearth current + forecast API payloads into advisory weatherSummary.
 */
export function assembleWeatherSummary(currentWeatherResp, forecastWeatherResp) {
  const currentWeather = currentWeatherResp?.current || currentWeatherResp;
  const forecast = forecastWeatherResp?.forecast || {};

  return {
    current: {
      temp: currentWeather?.temp,
      humidity: currentWeather?.relative_humidity,
      rainfall: currentWeather?.precipitation ?? currentWeather?.rain ?? 0,
      windSpeed: currentWeather?.wind_speed,
      et0: currentWeather?.et0_fao_evapotranspiration,
      soilMoisture_5cm: currentWeather?.soil_moisture_5cm,
      soilMoisture_15cm: currentWeather?.soil_moisture_15cm,
    },
    next7Days: {
      dates: forecast?.time?.slice(0, 7) ?? [],
      tempMean: forecast?.temp_mean?.slice(0, 7) ?? [],
      tempMax: forecast?.temp_max?.slice(0, 7) ?? [],
      tempMin: forecast?.temp_min?.slice(0, 7) ?? [],
      rainfall: forecast?.precipitation?.slice(0, 7) ?? [],
      humidity: forecast?.relative_humidity?.slice(0, 7) ?? [],
      et0: forecast?.evapotranspiration?.slice(0, 7) ?? [],
      windSpeed: forecast?.wind_speed?.slice(0, 7) ?? [],
      windGusts: forecast?.wind_gusts?.slice(0, 7) ?? [],
      cloudCover: forecast?.cloud_cover?.slice(0, 7) ?? [],
    },
  };
}

/**
 * Build a compact snapshot stored on FarmAdvisory for later comparison.
 */
export function buildWeatherSnapshot(weatherSummary) {
  const current = weatherSummary?.current || {};
  const next7 = weatherSummary?.next7Days || {};
  const rainfall = next7.rainfall || [];
  const tempMax = next7.tempMax || [];
  const tempMin = next7.tempMin || [];
  const windGusts = next7.windGusts || [];
  const windSpeed = next7.windSpeed || [];

  return {
    capturedAt: new Date().toISOString(),
    current: {
      temp: toNum(current.temp),
      humidity: toNum(current.humidity),
      rainfall: toNum(current.rainfall),
      windSpeed: toNum(current.windSpeed),
      et0: toNum(current.et0),
    },
    next3Days: {
      rainfallTotal: sumSlice(rainfall, 3),
      rainfallMaxDay: maxSlice(rainfall, 3) ?? 0,
      tempMax: maxSlice(tempMax, 3),
      tempMin: minSlice(tempMin, 3),
      windGustMax: maxSlice(windGusts, 3) ?? maxSlice(windSpeed, 3) ?? 0,
    },
    next7Days: {
      rainfallTotal: sumSlice(rainfall, 7),
      rainfallMaxDay: maxSlice(rainfall, 7) ?? 0,
      tempMax: maxSlice(tempMax, 7),
      tempMin: minSlice(tempMin, 7),
      windGustMax: maxSlice(windGusts, 7) ?? maxSlice(windSpeed, 7) ?? 0,
    },
  };
}

/**
 * Compare weather at last advisory vs now; returns true when change is farmer-relevant.
 */
export function hasSignificantWeatherChange(
  previousSnapshot,
  currentSnapshot,
  thresholds = WEATHER_CHANGE_THRESHOLDS,
) {
  if (!previousSnapshot || !currentSnapshot) {
    return { changed: false, reasons: [] };
  }

  const reasons = [];
  const prev = previousSnapshot;
  const curr = currentSnapshot;

  const tempDelta = absDelta(curr.current?.temp, prev.current?.temp);
  if (tempDelta != null && tempDelta >= thresholds.tempDeltaC) {
    reasons.push(`temp_change_${tempDelta.toFixed(1)}C`);
  }

  const humidityDelta = absDelta(curr.current?.humidity, prev.current?.humidity);
  if (humidityDelta != null && humidityDelta >= thresholds.humidityDeltaPct) {
    reasons.push(`humidity_change_${humidityDelta.toFixed(0)}pct`);
  }

  const rain3Prev = prev.next3Days?.rainfallTotal ?? 0;
  const rain3Curr = curr.next3Days?.rainfallTotal ?? 0;
  const rain3Delta = Math.abs(rain3Curr - rain3Prev);
  if (rain3Delta >= thresholds.rainfall3dDeltaMm) {
    reasons.push(`rainfall_3d_delta_${rain3Delta.toFixed(0)}mm`);
  }
  if (
    rain3Prev < thresholds.lightRain3dMm &&
    rain3Curr >= thresholds.heavyRain3dMm
  ) {
    reasons.push(`heavy_rain_forecast_${rain3Curr.toFixed(0)}mm_3d`);
  }

  const maxRainPrev = prev.next3Days?.rainfallMaxDay ?? 0;
  const maxRainCurr = curr.next3Days?.rainfallMaxDay ?? 0;
  if (
    maxRainCurr >= thresholds.heavyRainDayMm &&
    maxRainCurr - maxRainPrev >= thresholds.rainDaySpikeMm
  ) {
    reasons.push(`rain_spike_day_${maxRainCurr.toFixed(0)}mm`);
  }

  const tmaxPrev = prev.next3Days?.tempMax;
  const tmaxCurr = curr.next3Days?.tempMax;
  if (
    tmaxPrev != null &&
    tmaxCurr != null &&
    Math.abs(tmaxCurr - tmaxPrev) >= thresholds.forecastTempSwingC
  ) {
    reasons.push("forecast_max_temp_swing");
  }

  const tminPrev = prev.next3Days?.tempMin;
  const tminCurr = curr.next3Days?.tempMin;
  if (
    tminPrev != null &&
    tminCurr != null &&
    Math.abs(tminCurr - tminPrev) >= thresholds.forecastTempSwingC
  ) {
    reasons.push("forecast_min_temp_swing");
  }

  const gustPrev = prev.next3Days?.windGustMax ?? 0;
  const gustCurr = curr.next3Days?.windGustMax ?? 0;
  if (
    gustCurr >= thresholds.windGustAlertKmh &&
    gustCurr - gustPrev >= thresholds.windGustIncreaseKmh
  ) {
    reasons.push(`wind_alert_${gustCurr.toFixed(0)}kmh`);
  }

  return { changed: reasons.length > 0, reasons };
}

/**
 * For older advisories without a stored snapshot — alert on severe forecast only.
 */
export function hasSevereWeatherAlert(snapshot) {
  if (!snapshot?.next3Days) return false;

  const next3 = snapshot.next3Days;
  if ((next3.rainfallMaxDay ?? 0) >= 30) return true;
  if ((next3.rainfallTotal ?? 0) >= 40) return true;
  if (next3.tempMax != null && next3.tempMax >= 42) return true;
  if (next3.tempMin != null && next3.tempMin <= 5) return true;
  if ((next3.windGustMax ?? 0) >= 55) return true;

  return false;
}

/**
 * Decide whether the daily cron should generate a new advisory for a subscribed field.
 */
export function shouldGenerateAdvisory({
  gddDelta,
  threshold,
  lastAdvisory,
  currentSnapshot,
}) {
  if (!lastAdvisory) {
    return { generate: true, reason: "first_advisory" };
  }

  if (gddDelta >= threshold) {
    return { generate: true, reason: `gdd_delta_${gddDelta.toFixed(1)}` };
  }

  const lastSnapshot = lastAdvisory.weatherSnapshot;
  if (lastSnapshot && currentSnapshot) {
    const { changed, reasons } = hasSignificantWeatherChange(
      lastSnapshot,
      currentSnapshot,
    );
    if (changed) {
      return {
        generate: true,
        reason: `weather_change:${reasons.join(",")}`,
      };
    }
  } else if (hasSevereWeatherAlert(currentSnapshot)) {
    return { generate: true, reason: "severe_weather_no_baseline" };
  }

  return { generate: false, reason: "gdd_and_weather_unchanged" };
}
