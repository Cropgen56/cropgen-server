/** Stage-dependent crop parameters derived from the Crops tab. */

function lerp(a, b, t) {
  return a + (b - a) * Math.max(0, Math.min(1, t));
}

/** FAO-56 style Kc curve mapped onto BBCH: ini <20, development 20-39, mid 40-79, late 80-89. */
export function kcAtStage(crop, bbch) {
  const kc = crop?.kc;
  if (!kc) return null;
  const b = Number(bbch) || 0;
  if (crop.lifecycle !== "Annual") return kc.mid;
  if (b < 20) return kc.ini;
  if (b < 40) return lerp(kc.ini, kc.mid, (b - 20) / 20);
  if (b < 80) return kc.mid;
  return lerp(kc.mid, kc.end, (b - 80) / 10);
}

/** Effective root depth (m): grows from 0.15 m at sowing to the crop maximum by BBCH 60 (annuals). */
export function rootDepthAtStage(crop, bbch) {
  const max = Number(crop?.rootDepthM) || 0;
  if (!max) return 0;
  if (crop.lifecycle !== "Annual") return max;
  const start = Math.min(0.15, max);
  return lerp(start, max, (Number(bbch) || 0) / 60);
}

export function isCriticalStage(crop, bbch) {
  const b = Number(bbch) || 0;
  return (crop?.criticalBbch || []).some(([lo, hi]) => b >= lo && b <= hi);
}

export function isNearHarvest(crop, bbch, settings) {
  return crop?.lifecycle === "Annual" && (Number(bbch) || 0) >= settings.spray_harvest_block_bbch;
}

/**
 * Chemical-spray harvest block. Perennial fruit at BBCH 8x is ripening this season's
 * crop too (residue / PHI risk), so the block applies to them unless
 * spray_harvest_block_perennials is "false". Multi-cut crops (forage) are harvested
 * on a cutting cycle, not by stage, so stage cannot tell how near the next cut is.
 */
export function isNearHarvestForSpray(crop, bbch, settings) {
  if (!crop || crop.lifecycle === "Multi-cut") return false;
  if ((Number(bbch) || 0) < settings.spray_harvest_block_bbch) return false;
  if (crop.lifecycle === "Annual") return true;
  return String(settings.spray_harvest_block_perennials ?? "true").toLowerCase() !== "false";
}
