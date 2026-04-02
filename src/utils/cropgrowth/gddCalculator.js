import { CROP_BASE_TEMPERATURE } from "./cropBaseTemperature.js";
import { CROP_CATEGORY_MAP } from "./cropCategoryMap.js";
import { GDD_TEMPLATES } from "./gddStageTemplates.js";
import { BBCH_STAGE_MAP } from "./bbchStageMap.js";

/* ------------------ Helpers ------------------ */
export function normalizeCropName(name) {
  return name?.toLowerCase().replace(/[^a-z]/g, "");
}

export function getBaseTemperature(cropName) {
  const key = normalizeCropName(cropName);
  return CROP_BASE_TEMPERATURE[key] ?? CROP_BASE_TEMPERATURE.default;
}

export function calculateDailyGDD(tmax, tmin, baseTemp) {
  if (tmax == null || tmin == null) return 0;
  return Math.max(0, (tmax + tmin) / 2 - baseTemp);
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

export function calculateCumulativeGDD(rawWeatherData, baseTemp, sowingDateISO) {
  const dailyData = normalizeWeatherData(rawWeatherData);
  if (dailyData.length === 0) return [];

  const sowingDate = sowingDateISO ? new Date(sowingDateISO) : null;

  let cumulative = 0;
  const results = [];

  for (const day of dailyData) {
    const dayDate = new Date(day.date);
    if (sowingDate && dayDate < sowingDate) continue;

    const gdd = calculateDailyGDD(day.temp_max, day.temp_min, baseTemp);
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
  const key = normalizeCropName(cropName);
  const category = CROP_CATEGORY_MAP[key] || "vegetable";
  let stages = BBCH_STAGE_MAP[category] || BBCH_STAGE_MAP.vegetable;

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
  