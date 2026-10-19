import { CROP_BASE_TEMPERATURE } from "./cropBaseTemperature.js";
import { CROP_CATEGORY_MAP } from "./cropCategoryMap.js";
import { GDD_TEMPLATES } from "./gddStageTemplates.js";
import { BBCH_STAGE_MAP } from "./bbchStageMap.js";
import {
  CROP_MATURITY_GDD,
  CROP_SEASON_DAYS,
  PERENNIAL_OR_MULTI_HARVEST_CROPS,
} from "./cropMaturityGDD.js";

/* ------------------ Helpers ------------------ */
export function normalizeCropName(name) {
  return name?.toLowerCase().replace(/[^a-z]/g, "");
}

export function getBaseTemperature(cropName) {
  const key = normalizeCropName(cropName);
  return CROP_BASE_TEMPERATURE[key] ?? CROP_BASE_TEMPERATURE.default;
}

/**
 * Build the crop's own BBCH stage curve: same stage names/BBCH codes/
 * descriptions as its category (BBCH_STAGE_MAP), but with the cumulative-GDD
 * threshold for each stage rescaled to the crop's own season-total
 * (CROP_MATURITY_GDD) instead of the one shared category constant.
 *
 * WHY RESCALE RATHER THAN AUTHOR 143 FULL STAGE TABLES: BBCH_STAGE_MAP's
 * per-category *shape* (e.g. "cereal" spends its first ~8% of season-GDD in
 * germination, ~25% in tillering, etc.) is a reasonable, agronomically
 * sensible default within a category. What was wrong was reusing the same
 * *absolute total* (e.g. 2400 GDD) across every crop in that category. So we
 * keep the category's relative phenophase proportions but scale the total to
 * match each crop's real GDD-to-maturity — e.g. wheat's total drops from the
 * shared 2400 to its own ~2000, sugarcane's rises to ~5000.
 *
 * Falls back to the original, unscaled category curve (today's behaviour)
 * when the crop has no CROP_MATURITY_GDD entry — including all crops in
 * PERENNIAL_OR_MULTI_HARVEST_CROPS, which are deliberately never scaled
 * (see cropMaturityGDD.js for why).
 */
export function getCropStageCurve(cropName) {
  const key = normalizeCropName(cropName);
  const category = CROP_CATEGORY_MAP[key] || "vegetable";
  const categoryStages = BBCH_STAGE_MAP[category] || BBCH_STAGE_MAP.vegetable;

  const maturityGDD = CROP_MATURITY_GDD[key];
  if (!maturityGDD || PERENNIAL_OR_MULTI_HARVEST_CROPS.has(key)) {
    return categoryStages;
  }

  const categoryTotalGDD = categoryStages[categoryStages.length - 1]?.max;
  if (!categoryTotalGDD) return categoryStages;

  const scale = maturityGDD / categoryTotalGDD;
  return categoryStages.map((stage) => ({
    ...stage,
    max: Math.max(1, Math.round(stage.max * scale)),
  }));
}

/**
 * Typical days-from-sowing-to-maturity for the crop, for the hybrid engine's
 * calendar (DAE) signal — crop-specific companion to getCropStageCurve()'s
 * GDD scaling, using CROP_SEASON_DAYS instead of a shared per-category
 * constant (see cropMaturityGDD.js for why the category constant was wrong
 * for outlier-duration crops like sugarcane).
 *
 * @param {string} cropName
 * @param {number} categoryFallbackDays — caller's per-category default
 *   (e.g. CATEGORY_SEASON_DAYS[category] in hybridStageEngine.js), used
 *   as-is for perennial/multi-harvest crops and any crop with no
 *   CROP_SEASON_DAYS entry yet — i.e. today's behaviour, unchanged.
 */
export function getCropSeasonDays(cropName, categoryFallbackDays) {
  const key = normalizeCropName(cropName);
  if (PERENNIAL_OR_MULTI_HARVEST_CROPS.has(key)) return categoryFallbackDays;
  return CROP_SEASON_DAYS[key] ?? categoryFallbackDays;
}

/**
 * @param {number} tmax
 * @param {number} tmin
 * @param {number} baseTemp
 * @param {{ maxTempCap?: number | null }} [options] — cap Tmax (e.g. 30°C) for more realistic heat units
 */
export function calculateDailyGDD(tmax, tmin, baseTemp, options = {}) {
  if (tmax == null || tmin == null) return 0;
  const cap = options.maxTempCap;
  const effMax =
    cap != null && Number.isFinite(cap) ? Math.min(Number(tmax), cap) : Number(tmax);
  const effMin = Number(tmin);
  return Math.max(0, (effMax + effMin) / 2 - baseTemp);
}

export function normalizeWeatherData(weather) {
  if (!weather?.daily?.time) return [];

  const { time, temp_max, temp_min } = weather.daily;

  return time.map((date, index) => ({
    date,
    temp_max: temp_max[index],
    temp_min: temp_min[index],
  }));
}

export function calculateCumulativeGDD(
  rawWeatherData,
  baseTemp,
  sowingDateISO,
  options = {},
) {
  const dailyData = normalizeWeatherData(rawWeatherData);
  if (dailyData.length === 0) return [];

  const sowingDate = sowingDateISO ? new Date(sowingDateISO) : null;

  let cumulative = 0;
  const results = [];

  for (const day of dailyData) {
    const dayDate = new Date(day.date);
    if (sowingDate && dayDate < sowingDate) continue;

    const gdd = calculateDailyGDD(day.temp_max, day.temp_min, baseTemp, options);
    cumulative += gdd;

    results.push({
      date: day.date,
      dailyGDD: Number(gdd.toFixed(2)),
      cumulativeGDD: Number(cumulative.toFixed(1)),
    });
  }

  return results;
}

/* ------------------ NDVI Helpers (NEW) ------------------ */
function isNDVIDeclining(ndviValues, lookback = 3) {
  if (!Array.isArray(ndviValues) || ndviValues.length < lookback) return false;

  const recent = ndviValues.slice(-lookback);
  for (let i = 1; i < recent.length; i++) {
    if (recent[i] >= recent[i - 1]) return false;
  }
  return true;
}

/* ------------------ Simple Stage Name ------------------ */
export function getCropStage(cropName, cumulativeGDD) {
  const key = normalizeCropName(cropName);
  const category = CROP_CATEGORY_MAP[key] || "vegetable";
  const stages = GDD_TEMPLATES[category] || GDD_TEMPLATES.vegetable;

  if (cumulativeGDD == null || cumulativeGDD < 0) return "Pre-sowing";

  for (const stage of stages) {
    if (cumulativeGDD <= stage.max) {
      return stage.stage;
    }
  }

  return "Maturity";
}

/* ------------------ Full BBCH Stage with NDVI-aware Harvest ------------------ */
export function getCropGrowthStage(
  cropName,
  cumulativeGDD,
  ndvi = null,
) {
  let stages = getCropStageCurve(cropName);

  if (!stages || stages.length === 0) {
    stages = BBCH_STAGE_MAP.vegetable;
  }

  /* ---------- Pre-sowing / invalid ---------- */
  if (cumulativeGDD == null || isNaN(cumulativeGDD) || cumulativeGDD < 0) {
    const first = stages[0];
    return {
      bbchStage: first.bbch,
      stageName: first.stage,
      description: first.description,
      cumulativeGDD,
      overallProgress: 0,
      stageProgress: 0,
    };
  }

  /* ---------- Identify stage by GDD ---------- */
  const totalGDD = stages[stages.length - 1].max;
  let currentStage = stages[0];
  let prevMax = 0;

  for (const stage of stages) {
    if (cumulativeGDD <= stage.max) {
      currentStage = stage;
      break;
    }
    prevMax = stage.max;
  }

  /* ---------- NDVI-based Harvest Confirmation (NEW) ---------- */
  let isHarvestReady = false;

  if (ndvi?.values?.length) {
    const ndviValues = ndvi.values;
    const ndviCurrent = ndvi.ndviLatest;
    const ndviPeak = Math.max(...ndviValues);

    const ndviDeclining = isNDVIDeclining(ndviValues, 3);
    const ndviDrop =
      ndviPeak && ndviCurrent
        ? (ndviPeak - ndviCurrent) / ndviPeak
        : 0;

    const NDVI_DROP_THRESHOLD = 0.25; // 25%

    isHarvestReady =
      cumulativeGDD >= totalGDD &&
      ndviDeclining &&
      ndviDrop >= NDVI_DROP_THRESHOLD;
  }

  if (isHarvestReady) {
    currentStage = stages[stages.length - 1];
    prevMax = stages[stages.length - 2]?.max || 0;
  } else if (cumulativeGDD > totalGDD) {
    // fallback if NDVI unavailable
    currentStage = stages[stages.length - 1];
    prevMax = stages[stages.length - 2]?.max || 0;
  }

  /* ---------- Progress calculations ---------- */
  const overallProgress = Math.min(
    100,
    (cumulativeGDD / totalGDD) * 100
  );

  const stageRange = currentStage.max - prevMax;
  let stageProgress =
    stageRange > 0
      ? ((cumulativeGDD - prevMax) / stageRange) * 100
      : 100;

  stageProgress = Math.max(0, Math.min(100, stageProgress));

  /* ---------- FINAL RETURN ---------- */
  return {
    bbchStage: currentStage.bbch,
    stageName: currentStage.stage,
    cumulativeGDD,
    description: currentStage.description,
    overallProgress: Number(overallProgress.toFixed(1)),
    stageProgress: Number(stageProgress.toFixed(1)),
  };
}
  