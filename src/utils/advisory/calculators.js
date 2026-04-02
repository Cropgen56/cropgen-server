/**
 * Extract timeseries array from API response (handles multiple response formats).
 */
function getTimeseriesArray(vegTs) {
  const series =
    vegTs?.timeseries ||
    vegTs?.data?.timeseries ||
    vegTs?.results ||
    (Array.isArray(vegTs) ? vegTs : []);
  return Array.isArray(series) ? series : [];
}

/**
 * Extract date and value from a timeseries point (handles {date, value} or {timestamp, ndvi} etc).
 */
function getPointDateValue(p) {
  const date = p?.date ?? p?.timestamp ?? p?.time ?? null;
  const value = p?.value ?? p?.ndvi ?? p?.index ?? p?.mean ?? null;
  return { date: String(date || ""), value: Number(value) };
}

export function parseNDVIMetrics(vegTs) {
  const series = getTimeseriesArray(vegTs);
  if (!series.length) return { ndviLatest: null, ndviMean: null, trend: 0, ndviTrend: 0, values: [] };

  const points = series
    .map((p) => getPointDateValue(p))
    .filter((p) => p.date && !Number.isNaN(p.value));
  if (!points.length) return { ndviLatest: null, ndviMean: null, trend: 0, ndviTrend: 0, values: [] };

  const sorted = [...points].sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const values = sorted.map((p) => p.value);

  const trend = +(values.at(-1) - values[0]).toFixed(3);
  return {
    ndviLatest: values.at(-1),
    ndviMean: values.reduce((a, b) => a + b, 0) / values.length,
    trend,
    ndviTrend: trend, // alias for compatibility
    values, // for gddCalculator harvest logic
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
