/** Indices whose `/calculate/index` legend is averaged into composite vegetation vigor. */
const VEGETATION_OPTICAL_FOR_COMPOSITE = new Set([
  "NDVI",
  "EVI",
  "EVI2",
  "SAVI",
  "MSAVI",
  "NDRE",
  "RECI",
  "CCC",
]);

const LEGEND_LABEL_WEIGHTS = {
  clouds: 50,
  cloud: 50,
  "very poor": 12,
  poor: 28,
  fair: 42,
  moderate: 55,
  good: 72,
  "very good": 82,
  excellent: 90,
  dense: 92,
  "very dense": 95,
  extreme: 98,
};

function normalizeLegendLabel(label) {
  return String(label || "")
    .trim()
    .toLowerCase();
}

/**
 * Map `/calculate/index` legend rows to a 0–100 field-health score (higher = better vigor).
 */
export function summarizeIndexImageLegend(legend) {
  if (!Array.isArray(legend) || legend.length === 0) return null;

  let weighted = 0;
  let totalPct = 0;
  let dominant = { label: null, percent: -1 };
  let cloudCoverPercent = 0;

  for (const row of legend) {
    const pct = Number(row?.percent);
    if (!Number.isFinite(pct) || pct <= 0) continue;
    const labelRaw = String(row?.label ?? "").trim();
    const key = normalizeLegendLabel(labelRaw);
    totalPct += pct;

    if (key.includes("cloud")) {
      cloudCoverPercent += pct;
    }

    const w =
      LEGEND_LABEL_WEIGHTS[key] ??
      LEGEND_LABEL_WEIGHTS[key.replace(/\s+/g, " ")] ??
      55;
    weighted += (w * pct) / 100;

    if (pct > dominant.percent) {
      dominant = { label: labelRaw || key, percent: pct };
    }
  }

  if (totalPct <= 0) return null;

  const healthScore = Math.round(Math.max(0, Math.min(100, weighted)));
  return {
    healthScore,
    dominantLabel: dominant.label,
    dominantPercent: dominant.percent >= 0 ? dominant.percent : null,
    cloudCoverPercent: Math.round(cloudCoverPercent * 100) / 100,
  };
}

/**
 * Compact advisory payload from fetchOpticalIndexSnapshots results (no image_base64).
 */
export function buildOpticalIndicesSummary(snapshotRows, snapshotDate) {
  const indices = {};
  const vegScores = [];
  let okCount = 0;

  for (const row of snapshotRows) {
    const { indexName } = row;
    if (!row.ok) {
      indices[indexName] = { error: row.error || "request_failed" };
      continue;
    }

    const data = row.data || {};
    const apiDate = data.date ? String(data.date).slice(0, 10) : snapshotDate;

    if (indexName === "TRUE_COLOR") {
      indices[indexName] = {
        date: apiDate,
        hasImage: Boolean(data.image_base64),
        bounds: data.bounds ?? null,
      };
      okCount += 1;
      continue;
    }

    const legendSummary = summarizeIndexImageLegend(data.legend);
    if (!legendSummary) {
      indices[indexName] = { date: apiDate, error: "no_legend" };
      continue;
    }

    indices[indexName] = {
      date: apiDate,
      ...legendSummary,
      areaStats: data.area_stats ?? null,
    };
    okCount += 1;
    if (VEGETATION_OPTICAL_FOR_COMPOSITE.has(indexName)) {
      vegScores.push(legendSummary.healthScore);
    }
  }

  const compositeVegetationScore =
    vegScores.length > 0
      ? Math.round(vegScores.reduce((a, b) => a + b, 0) / vegScores.length)
      : null;

  return {
    snapshotDate,
    indices,
    compositeVegetationScore,
    vegetationIndexCount: vegScores.length,
    successfulIndexCount: okCount,
  };
}
