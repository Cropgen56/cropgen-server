/**
 * Precision Yield Calculator — multivariate model.
 * Enhances the existing calculateYield with:
 *   - Temperature stress (heat/cold during critical stages)
 *   - Soil fertility inference from NPK deficit
 *   - Historical / target yield calibration
 *   - Yield gap analysis and limiting factor identification
 */

import { CROP_YIELD_PROFILE } from "../cropyield/cropYieldProfile.js";

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** Optimal temperature range (°C) by crop category during grain/fruit fill */
const OPTIMAL_TEMP = {
  cereal:    { min: 12, max: 30 },
  pulse:     { min: 15, max: 32 },
  oilseed:   { min: 15, max: 30 },
  vegetable: { min: 18, max: 32 },
  fruit:     { min: 15, max: 35 },
  default:   { min: 15, max: 32 },
};

/**
 * Compute temperature stress factor (0–1) from current min/max temps.
 * Factor = 1 when within optimal range; drops linearly beyond ±5°C of bounds.
 */
function computeTemperatureStress(tMin, tMax, cropCategory) {
  const range = OPTIMAL_TEMP[cropCategory] || OPTIMAL_TEMP.default;
  if (tMin == null && tMax == null) return 1.0;

  const effectiveMin = tMin ?? range.min;
  const effectiveMax = tMax ?? range.max;

  const coldPenalty = effectiveMin < range.min
    ? clamp(1 - (range.min - effectiveMin) / 10, 0.6, 1)
    : 1;

  const heatPenalty = effectiveMax > range.max
    ? clamp(1 - (effectiveMax - range.max) / 10, 0.6, 1)
    : 1;

  return Number((coldPenalty * heatPenalty).toFixed(3));
}

/**
 * Infer soil fertility from NPK fulfillment ratio.
 * available-to-required ratio → 'low' / 'medium' / 'high'
 */
function inferSoilFertility(npkManagement) {
  const req = npkManagement?.required;
  const avail = npkManagement?.available;
  if (!req || !avail) return "medium";

  const reqSum = (req.nitrogenKgPerHa || 0) + (req.phosphorousKgPerHa || 0) + (req.potassiumKgPerHa || 0);
  if (reqSum <= 0) return "medium";

  const availSum = (avail.nitrogenKgPerHa || 0) + (avail.phosphorousKgPerHa || 0) + (avail.potassiumKgPerHa || 0);
  const ratio = availSum / reqSum;

  if (ratio >= 0.85) return "high";
  if (ratio >= 0.60) return "medium";
  return "low";
}

/** Soil fertility multiplier */
const SOIL_FERTILITY_FACTOR = { high: 1.15, medium: 1.0, low: 0.80 };

/**
 * Water stress factor from NDMI (water index, typically -1 to +1).
 * NDMI > 0.1 = adequate, < -0.1 = stressed.
 */
function computeWaterStressFactor(waterLatest) {
  if (waterLatest == null) return 0.9; // unknown → slightly penalised
  if (waterLatest >= 0.1) return 1.0;
  if (waterLatest >= -0.05) return 0.92;
  if (waterLatest >= -0.15) return 0.80;
  return 0.68;
}

/**
 * NDVI factor calibrated per crop category expected range.
 */
const NDVI_RANGE = {
  cereal:    { lo: 0.45, hi: 0.75 },
  pulse:     { lo: 0.35, hi: 0.65 },
  oilseed:   { lo: 0.40, hi: 0.70 },
  vegetable: { lo: 0.55, hi: 0.85 },
  fruit:     { lo: 0.50, hi: 0.80 },
  default:   { lo: 0.40, hi: 0.70 },
};

function computeNdviFactor(ndviLatest, category) {
  if (ndviLatest == null) return 1.0;
  const { lo, hi } = NDVI_RANGE[category] || NDVI_RANGE.default;
  if (ndviLatest < lo)  return 0.85;
  if (ndviLatest > hi)  return 1.05;
  return 1.0;
}

/**
 * Identify the single biggest limiting factor from a factor map.
 * @param {Object} factors - key → multiplier (all ≤ 1.0 means penalty)
 * @returns {string}
 */
function findLimitingFactor(factors) {
  return Object.entries(factors).reduce((worst, [k, v]) =>
    v < worst[1] ? [k, v] : worst,
    ["Balanced", 1],
  )[0];
}

/**
 * Generate a limiting-factor recommendation.
 */
function limitingFactorRecommendation(factor) {
  const map = {
    "Soil fertility":    "Increase nutrient supply through fertigation or split applications.",
    "Water availability":"Enhance irrigation frequency; check soil moisture at 15 cm depth.",
    "Temperature stress":"Monitor weather; consider microclimate management (mulching, shade nets).",
    "Biomass (NDVI)":    "Improve canopy coverage; manage pests/diseases; check spacing.",
    "Balanced":          "Maintain current management practices.",
  };
  return map[factor] ?? "Maintain current management practices.";
}

/**
 * Calculate precise, multivariate yield prediction.
 *
 * @param {Object} params
 * @param {Object} params.farmField        - FarmField document
 * @param {Object} params.cropHealth       - From calcCropHealth
 * @param {Object} params.plantGrowthActivity - BBCH stage object
 * @param {Object} params.npkManagement    - From calculateNPKFromfarmField
 * @param {Object} params.ndvi             - Parsed NDVI metrics
 * @param {Object} params.water            - Parsed water/NDMI metrics
 * @param {Object} params.weatherSummary   - Current + 7-day forecast
 * @param {string} [params.language]
 * @returns {Object} Enhanced yield object with gap analysis
 */
export function calculateYieldPrecise({
  farmField,
  cropHealth,
  plantGrowthActivity,
  npkManagement,
  ndvi,
  water,
  weatherSummary,
  language = "en",
}) {
  const cropKey = (farmField.cropName || "").toLowerCase().replace(/[^a-z]/g, "");
  const profile = CROP_YIELD_PROFILE[cropKey] ?? CROP_YIELD_PROFILE.default ?? { baseYieldPerHa: 40, unit: "quintal", category: "default" };
  const category = profile.category || "default";

  const areaHa = (farmField.acre || 1) / 2.471;

  /* --- Growth progress factor (season-end projection) --- */
  const progress = (plantGrowthActivity?.overallProgress ?? 0) / 100;
  const growthFactor = clamp(0.65 + 0.35 * Math.sqrt(Math.max(progress, 0.02)), 0.65, 1.0);

  /* --- Crop health factor --- */
  const healthScore = cropHealth?.score ?? 0.7;
  const healthFactor = clamp(0.75 + healthScore * 0.4, 0.75, 1.1);

  /* --- NDVI factor --- */
  const ndviFactor = computeNdviFactor(ndvi?.ndviLatest, category);

  /* --- Water stress factor --- */
  const waterFactor = computeWaterStressFactor(water?.waterLatest);

  /* --- Temperature stress factor --- */
  const tMin = weatherSummary?.current?.temp?.min ?? weatherSummary?.next7Days?.tempMin?.[0] ?? null;
  const tMax = weatherSummary?.current?.temp?.max ?? weatherSummary?.next7Days?.tempMax?.[0] ?? null;
  const tempFactor = computeTemperatureStress(tMin, tMax, category);

  /* --- Soil fertility (inferred from NPK) --- */
  const soilFertility = inferSoilFertility(npkManagement);
  const soilFactor = SOIL_FERTILITY_FACTOR[soilFertility] ?? 1.0;

  /* --- Standard yield (profile benchmark × area) --- */
  const standardYield = profile.baseYieldPerHa * areaHa;

  /* --- AI yield with all factors --- */
  const compositeFieldFactor = growthFactor * healthFactor * ndviFactor * waterFactor * tempFactor * soilFactor;
  const confidence = (healthScore + clamp(ndvi?.ndviLatest ?? 0.5, 0, 1) + clamp(water?.waterLatest ?? 0, -1, 1) / 2 + 0.5) / 3;
  const aiBand = clamp(0.93 + confidence * 0.09, 0.93, 1.07);
  const aiYield = standardYield * compositeFieldFactor * aiBand;

  /* --- Yield gap analysis --- */
  const targetYield = standardYield; // profile benchmark = achievable target
  const yieldGap = Math.max(0, targetYield - aiYield);
  const gapPercent = targetYield > 0 ? Number(((yieldGap / targetYield) * 100).toFixed(1)) : 0;

  const factors = {
    "Soil fertility":    soilFactor,
    "Water availability":waterFactor,
    "Temperature stress":tempFactor,
    "Biomass (NDVI)":    ndviFactor,
  };
  const limitingFactor = findLimitingFactor(factors);

  /* --- Confidence 0–100 --- */
  const confidencePct = Math.round(clamp(50 + confidence * 45, 50, 97));

  return {
    yield: {
      standardYield: Number(standardYield.toFixed(2)),
      aiYield: Number(aiYield.toFixed(2)),
      unit: profile.unit,
      explanation: language === "mr"
        ? "मानक उत्पादन: पिक प्रोफाइलनुसार × क्षेत्र. AI: वाढ, आरोग्य, तापमान, पाणी, माती यावर आधारित."
        : language === "hi"
        ? "मानक: प्रोफ़ाइल × क्षेत्र। AI: वृद्धि, स्वास्थ्य, तापमान, पानी, मिट्टी के आधार पर।"
        : "Standard = crop profile benchmark × farm area. AI adjusts using growth, health, temperature, water, and soil fertility.",
    },
    yieldGap: {
      targetYield: Number(targetYield.toFixed(2)),
      aiYield: Number(aiYield.toFixed(2)),
      gap: Number(yieldGap.toFixed(2)),
      gapPercent,
      unit: profile.unit,
      limitingFactor,
      confidence: confidencePct,
      recommendation: limitingFactorRecommendation(limitingFactor),
      soilFertility,
      factorBreakdown: {
        growth:      Number(growthFactor.toFixed(3)),
        health:      Number(healthFactor.toFixed(3)),
        ndvi:        Number(ndviFactor.toFixed(3)),
        water:       Number(waterFactor.toFixed(3)),
        temperature: Number(tempFactor.toFixed(3)),
        soil:        Number(soilFactor.toFixed(3)),
      },
    },
  };
}
