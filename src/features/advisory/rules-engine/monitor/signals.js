/**
 * Turn raw satellite series into "latest vs reference" signals.
 *
 * Optical (Sentinel-2) series are expected to be cloud-filtered already
 * (utils/satellite/vegWaterParsers.js). Radar (Sentinel-1) works through cloud.
 */

export function daysBetween(aISO, bISO) {
  return Math.round((new Date(`${String(bISO).slice(0, 10)}T12:00:00Z`) - new Date(`${String(aISO).slice(0, 10)}T12:00:00Z`)) / 86400000);
}

function cleanSeries(series, field = "value") {
  return (Array.isArray(series) ? series : [])
    .map((p) => ({ date: String(p?.date || "").slice(0, 10), value: Number(p?.[field]) }))
    .filter((p) => p.date && Number.isFinite(p.value))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Latest value and a reference value from 5–20 days earlier.
 * `reference` = best (max) value in that window for vigour indices, so a single
 * low reading does not hide a real drop.
 */
export function latestVsReference(series, { todayISO, field = "value", minGap = 5, maxGap = 20, maxAgeDays = 12, pick = "max" } = {}) {
  const pts = cleanSeries(series, field);
  if (!pts.length) return null;
  const latest = pts[pts.length - 1];
  const ageDays = todayISO ? daysBetween(latest.date, todayISO) : 0;
  const window = pts.filter((p) => {
    const gap = daysBetween(p.date, latest.date);
    return gap >= minGap && gap <= maxGap;
  });
  let reference = null;
  if (window.length) {
    const values = window.map((p) => p.value);
    const refValue = pick === "max" ? Math.max(...values) : values[values.length - 1];
    const refPoint = window.find((p) => p.value === refValue) || window[window.length - 1];
    reference = { date: refPoint.date, value: refValue };
  }
  return {
    date: latest.date,
    value: latest.value,
    ageDays,
    stale: ageDays > maxAgeDays,
    reference,
    change: reference ? Number((latest.value - reference.value).toFixed(3)) : null,
  };
}

/** Convert a SAR backscatter value to dB if it looks linear (> 0). */
export function toDb(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  if (n > 0) return Number((10 * Math.log10(n)).toFixed(2));
  return n;
}

/** Sentinel-1 signal: latest VV/VH (dB) vs previous acquisition 5–25 days earlier. */
export function sarSignal(series, { todayISO, maxAgeDays = 14 } = {}) {
  const pts = (Array.isArray(series) ? series : [])
    .map((p) => ({ date: String(p?.date || "").slice(0, 10), vv: toDb(p?.vv ?? p?.VV), vh: toDb(p?.vh ?? p?.VH) }))
    .filter((p) => p.date && (p.vv !== null || p.vh !== null))
    .sort((a, b) => a.date.localeCompare(b.date));
  if (!pts.length) return null;
  const latest = pts[pts.length - 1];
  const prev = [...pts]
    .reverse()
    .find((p) => {
      const gap = daysBetween(p.date, latest.date);
      return gap >= 5 && gap <= 25;
    });
  const ageDays = todayISO ? daysBetween(latest.date, todayISO) : 0;
  return {
    date: latest.date,
    vv: latest.vv,
    vh: latest.vh,
    ageDays,
    stale: ageDays > maxAgeDays,
    prev: prev ? { date: prev.date, vv: prev.vv, vh: prev.vh } : null,
    vvChange: prev && latest.vv !== null && prev.vv !== null ? Number((latest.vv - prev.vv).toFixed(2)) : null,
    vhChange: prev && latest.vh !== null && prev.vh !== null ? Number((latest.vh - prev.vh).toFixed(2)) : null,
  };
}

/** Expected index value for crop group/category at a BBCH stage, from the Expected Curves tab. */
export function expectedValue(rules, crop, bbch, index = "NDVI") {
  const curves = rules.expectedCurves || {};
  const list =
    curves[`${crop?.key}:${index}`] || curves[`${crop?.group}:${index}`] || curves[`${crop?.category}:${index}`] || null;
  if (!list) return null;
  const b = Number(bbch) || 0;
  const row = list.find((r) => b >= r.bbchMin && b <= r.bbchMax);
  return row ? { value: row.value, tolerance: row.tolerance } : null;
}
