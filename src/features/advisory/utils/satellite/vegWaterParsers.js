function getTimeseriesArray(vegTs) {
  const series =
    vegTs?.timeseries ||
    vegTs?.data?.timeseries ||
    vegTs?.results ||
    (Array.isArray(vegTs) ? vegTs : []);
  return Array.isArray(series) ? series : [];
}

function getPointDateValue(p) {
  const date = p?.date ?? p?.timestamp ?? p?.time ?? null;
  const value = p?.value ?? p?.ndvi ?? p?.index ?? p?.mean ?? null;
  return { date: String(date || ""), value: Number(value) };
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

  const points = inputSeries
    .map((p) => getPointDateValue(p))
    .filter((p) => p.date && !Number.isNaN(p.value));
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
