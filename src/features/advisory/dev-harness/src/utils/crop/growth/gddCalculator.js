// Simplified stand-in (real file lives in the backend). Linear BBCH over a 1800-GDD season.
const TOTAL = 1800;
export function normalizeCropName(n) { return String(n || "").toLowerCase().replace(/[^a-z]/g, ""); }
export function getBaseTemperature() { return 10; }
export function calculateDailyGDD(tmax, tmin, base = 10) { return Math.max(0, (Math.min(tmax, 35) + tmin) / 2 - base); }
export function calculateCumulativeGDD(hist, base, sowingISO, { maxTempCap = 35 } = {}) {
  const d = hist?.daily; if (!d?.time?.length) return [];
  let cum = 0; const out = [];
  d.time.forEach((t, i) => { const date = String(t).slice(0, 10); if (date < sowingISO) return; const g = Math.max(0, (Math.min(d.temp_max[i], maxTempCap) + d.temp_min[i]) / 2 - base); cum += g; out.push({ date, dailyGDD: g, cumulativeGDD: Number(cum.toFixed(1)) }); });
  return out;
}
const STAGES = [[0, "Sowing"], [10, "Emergence"], [20, "Tillering / branching"], [30, "Stem elongation"], [50, "Bud formation"], [60, "Flowering"], [70, "Fruit / pod development"], [80, "Ripening"], [89, "Maturity"]];
export function getCropStageCurve() { return STAGES.map(([bbch, stage], i) => ({ bbch, stage, description: stage, max: Math.round(((i + 1) / STAGES.length) * TOTAL) })); }
export function getCropSeasonDays() { return 110; }
export function getCropGrowthStage(name, gdd) { const c = getCropStageCurve(); const s = c.find((x) => gdd <= x.max) || c[c.length - 1]; return { bbchStage: s.bbch, stageName: s.stage, description: s.description, overallProgress: Math.min(100, (gdd / TOTAL) * 100) }; }
