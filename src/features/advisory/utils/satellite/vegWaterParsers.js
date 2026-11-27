function getTimeseriesArray(vegTs) {
  const series =
    vegTs?.timeseries ||
    vegTs?.data?.timeseries ||
    vegTs?.results ||
    (Array.isArray(vegTs) ? vegTs : []);
  return Array.isArray(series) ? series : [];
}

/** Scenes cloudier than this (inside the field, when the provider reports it) are dropped. */
const NDVI_MAX_CLOUD_PCT = Number(process.env.NDVI_MAX_CLOUD_PCT) || 40;

function getPointDateValue(p) {
  const date = p?.date ?? p?.timestamp ?? p?.time ?? null;
  const value = p?.value ?? p?.ndvi ?? p?.index ?? p?.mean ?? null;
  const cloudRaw = p?.cloud_cover ?? p?.cloudCover ?? p?.cloud ?? p?.cloud_percentage ?? p?.cloud_pct ?? null;
  const cloud = cloudRaw === null || cloudRaw === undefined || cloudRaw === "" ? null : Number(cloudRaw);
  return { date: String(date || ""), value: Number(value), cloud: Number.isFinite(cloud) ? cloud : null };
}

/** Keep valid NDVI values from clear scenes; if every scene is cloudy keep them all (flagged). */
function clearScenes(points) {
  const valid = points.filter((p) => p.value >= -1 && p.value <= 1);
  const clear = valid.filter((p) => p.cloud === null || p.cloud <= NDVI_MAX_CLOUD_PCT);
  if (clear.length) return { points: clear, droppedCloudy: valid.length - clear.length, allCloudy: false };
  return { points: valid, droppedCloudy: 0, allCloudy: valid.length > 0 };
}

/**
 * Latest observation date (YYYY-MM-DD) from vegetation timeseries payload.
 */
export function getLatestVegetationTimeseriesDate(vegTs) {
  const series = getTimeseriesArray(vegTs);
  const dates = series
    .map((p) => p?.date ?? p?.timestamp ?? p?.time ?? null)
    .filter(Boolean)
    .map((d) => String(d).slice(0, 10));
  if (!dates.length) return null;
  const sorted = [...dates].sort((a, b) => a.localeCompare(b));
  return sorted.at(-1) || null;
}

export function parseNDVIMetrics(vegTs) {
  const inputSeries = getTimeseriesArray(vegTs);
  if (!inputSeries.length) return { ndviLatest: null, ndviMean: null, trend: 0, ndviTrend: 0, values: [] };

  const parsed = inputSeries
    .map((p) => getPointDateValue(p))
    .filter((p) => p.date && !Number.isNaN(p.value));
  const { points, droppedCloudy, allCloudy } = clearScenes(parsed);
  if (!points.length) return { ndviLatest: null, ndviMean: null, trend: 0, ndviTrend: 0, values: [] };

  const sorted = [...points].sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const values = sorted.map((p) => p.value);
  const series = sorted.map((p) => ({
    date: String(p.date).slice(0, 10),
    value: p.value,
  }));

  const trend = +(values.at(-1) - values[0]).toFixed(3);
  return {
    ndviLatest: values.at(-1),
    ndviMean: values.reduce((a, b) => a + b, 0) / values.length,
    trend,
    ndviTrend: trend,
    values,
    series,
    droppedCloudy,
    allCloudy,
  };
}

export function parseWaterMetrics(waterTs) {
  const series =
    waterTs?.timeseries ||
    waterTs?.data?.timeseries ||
    waterTs?.results ||
    (Array.isArray(waterTs) ? waterTs : []);
  const arr = Array.isArray(series) ? series : [];
  if (!arr.length) return { waterLatest: null, waterMean: null };

  const points = arr
    .map((p) => ({
      date: p?.date ?? p?.timestamp ?? p?.time,
      value: p?.value ?? p?.ndmi ?? p?.index ?? p?.mean,
    }))
    .filter((p) => p.date != null && !Number.isNaN(Number(p.value)));
  if (!points.length) return { waterLatest: null, waterMean: null };

  const sorted = [...points].sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const values = sorted.map((p) => Number(p.value));
  return {
    waterLatest: values.at(-1),
    waterMean: values.reduce((a, b) => a + b, 0) / values.length,
  };
}
