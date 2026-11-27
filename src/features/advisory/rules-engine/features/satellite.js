/**
 * Satellite signals for the rules engine. Pure functions over the parsed NDVI
 * series (utils/satellite/vegWaterParsers.js → ndvi.series, already filtered
 * for cloudy scenes).
 */

function daysBetween(aISO, bISO) {
  return Math.round((new Date(`${bISO}T12:00:00Z`) - new Date(`${aISO}T12:00:00Z`)) / 86400000);
}

/**
 * Drop in NDVI between the latest clear scene and the best clear scene in the
 * 5–20 days before it. Returns null when it cannot be judged reliably: too few
 * scenes, latest scene older than `maxAgeDays`, or the crop is in natural
 * senescence (BBCH ≥ 80) where NDVI is expected to fall.
 *
 * @param {{ series?: {date: string, value: number}[] }} ndvi
 * @param {{ bbch?: number, todayISO: string, maxAgeDays?: number }} opts
 */
export function ndviDrop(ndvi, { bbch = 0, todayISO, maxAgeDays = 10 } = {}) {
  const series = Array.isArray(ndvi?.series) ? ndvi.series.filter((p) => Number.isFinite(p?.value)) : [];
  if (series.length < 2 || Number(bbch) >= 80) return null;
  const latest = series[series.length - 1];
  if (todayISO && daysBetween(latest.date, todayISO) > maxAgeDays) return null;
  const earlier = series.filter((p) => {
    const gap = daysBetween(p.date, latest.date);
    return gap >= 5 && gap <= 20;
  });
  if (!earlier.length) return null;
  const reference = Math.max(...earlier.map((p) => p.value));
  return Number((reference - latest.value).toFixed(3));
}
