import { CROP_YIELD_PROFILE } from "./cropYieldProfile.js";
import { t } from "../utils/i18n/advisoryLocale.js";
import { normalizeAdvisoryLanguage } from "../utils/i18n/advisoryLanguages.js";

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function getYieldProfile(farmField) {
  const cropKey = (farmField?.cropName || "").toLowerCase().replace(/[^a-z]/g, "");
  return (
    CROP_YIELD_PROFILE[cropKey] ??
    CROP_YIELD_PROFILE.default ?? { baseYieldPerHa: 40, unit: "quintal", category: "default" }
  );
}

export function calculateStandardYieldBaseline(farmField) {
  const profile = getYieldProfile(farmField);
  const areaHa = Number(farmField?.acre || 0) / 2.471;
  const standardYield = profile.baseYieldPerHa * areaHa;
  return {
    standardYield: Number(standardYield.toFixed(2)),
    unit: profile.unit || "quintal",
  };
}

const OPTIMAL_TEMP = {
  cereal: { min: 12, max: 30 },
  pulse: { min: 15, max: 32 },
  oilseed: { min: 15, max: 30 },
  vegetable: { min: 18, max: 32 },
  fruit: { min: 15, max: 35 },
  // 65-crop expansion (flowers/herbs/spices/plantation) — see CROP_YIELD_PROFILE
  flower: { min: 15, max: 32 },
  herb: { min: 15, max: 32 },
  spice: { min: 18, max: 34 },
  plantation: { min: 15, max: 32 },
  default: { min: 15, max: 32 },
};

function computeTemperatureStress(tMin, tMax, cropCategory) {
  const range = OPTIMAL_TEMP[cropCategory] || OPTIMAL_TEMP.default;
  if (tMin == null && tMax == null) return 1.0;

  const effectiveMin = tMin ?? range.min;
  const effectiveMax = tMax ?? range.max;

  const coldPenalty =
    effectiveMin < range.min ? clamp(1 - (range.min - effectiveMin) / 18, 0.75, 1) : 1;
  const heatPenalty =
    effectiveMax > range.max ? clamp(1 - (effectiveMax - range.max) / 18, 0.75, 1) : 1;

  return Number((coldPenalty * heatPenalty).toFixed(3));
}

function normalizeCurrentTemp(currentTemp) {
  if (typeof currentTemp === "number") {
    return { min: currentTemp, max: currentTemp };
  }
  if (currentTemp && typeof currentTemp === "object") {
    const min = Number.isFinite(currentTemp.min) ? currentTemp.min : null;
    const max = Number.isFinite(currentTemp.max) ? currentTemp.max : null;
    const val = Number.isFinite(currentTemp.value)
      ? currentTemp.value
      : Number.isFinite(currentTemp.mean)
        ? currentTemp.mean
        : null;
    return {
      min: min ?? val,
      max: max ?? val,
    };
  }
  return { min: null, max: null };
}

function inferSoilFertility(npkManagement) {
  const req = npkManagement?.required;
  const avail = npkManagement?.available;
  if (!req || !avail) return "medium";

  const reqSum =
    (req.nitrogenKgPerHa || 0) + (req.phosphorousKgPerHa || 0) + (req.potassiumKgPerHa || 0);
  if (reqSum <= 0) return "medium";

  const availSum =
    (avail.nitrogenKgPerHa || 0) +
    (avail.phosphorousKgPerHa || 0) +
    (avail.potassiumKgPerHa || 0);
  const ratio = availSum / reqSum;

  if (ratio >= 0.85) return "high";
  if (ratio >= 0.6) return "medium";
  return "low";
}

const SOIL_FERTILITY_FACTOR = { high: 1.15, medium: 1.0, low: 0.8 };

function computeWaterStressFactor(waterLatest) {
  if (waterLatest == null) return 0.9;
  if (waterLatest >= 0.1) return 1.0;
  if (waterLatest >= -0.05) return 0.92;
  if (waterLatest >= -0.15) return 0.8;
  return 0.68;
}

const NDVI_RANGE = {
  cereal: { lo: 0.45, hi: 0.75 },
  pulse: { lo: 0.35, hi: 0.65 },
  oilseed: { lo: 0.4, hi: 0.7 },
  vegetable: { lo: 0.55, hi: 0.85 },
  fruit: { lo: 0.5, hi: 0.8 },
  default: { lo: 0.4, hi: 0.7 },
};

function computeNdviFactor(ndviLatest, category) {
  if (ndviLatest == null) return 1.0;
  const { lo, hi } = NDVI_RANGE[category] || NDVI_RANGE.default;
  if (ndviLatest < lo) return 0.85;
  if (ndviLatest > hi) return 1.05;
  return 1.0;
}

function findLimitingFactor(factors) {
  return Object.entries(factors).reduce((worst, [k, v]) => (v < worst[1] ? [k, v] : worst), [
    "Balanced",
    1,
  ])[0];
}

function limitingFactorRecommendation(factor) {
  const map = {
    "Soil fertility":
      "Increase nutrient supply through fertigation or split applications.",
    "Water availability":
      "Enhance irrigation frequency; check soil moisture at 15 cm depth.",
    "Temperature stress":
      "Monitor weather; consider microclimate management (mulching, shade nets).",
    "Biomass (NDVI)":
      "Improve canopy coverage; manage pests/diseases; check spacing.",
    Balanced: "Maintain current management practices.",
  };
  return map[factor] ?? "Maintain current management practices.";
}

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
  const profile = getYieldProfile(farmField);
  const category = profile.category || "default";

  const areaHa = Number(farmField?.acre || 0) / 2.471;
  const progress = (plantGrowthActivity?.overallProgress ?? 0) / 100;
  const growthFactor = clamp(0.65 + 0.35 * Math.sqrt(Math.max(progress, 0.02)), 0.65, 1.0);
  const healthScore = cropHealth?.score ?? 0.7;
  const healthFactor = clamp(0.75 + healthScore * 0.4, 0.75, 1.1);
  const ndviFactor = computeNdviFactor(ndvi?.ndviLatest, category);
  const waterFactor = computeWaterStressFactor(water?.waterLatest);

  const currentTemp = normalizeCurrentTemp(weatherSummary?.current?.temp);
  const tMin = currentTemp.min ?? weatherSummary?.next7Days?.tempMin?.[0] ?? null;
  const tMax = currentTemp.max ?? weatherSummary?.next7Days?.tempMax?.[0] ?? null;
  const tempFactor = computeTemperatureStress(tMin, tMax, category);

  const soilFertility = inferSoilFertility(npkManagement);
  const soilFactor = SOIL_FERTILITY_FACTOR[soilFertility] ?? 1.0;

  const standardYield = profile.baseYieldPerHa * areaHa;
  const compositeFieldFactor = growthFactor * healthFactor * ndviFactor * waterFactor * tempFactor * soilFactor;
  const confidence =
    (healthScore + clamp(ndvi?.ndviLatest ?? 0.5, 0, 1) + clamp(water?.waterLatest ?? 0, -1, 1) / 2 + 0.5) /
    3;
  const aiBand = clamp(0.93 + confidence * 0.09, 0.93, 1.07);
  const aiYield = standardYield * compositeFieldFactor * aiBand;

  const targetYield = standardYield;
  const yieldGap = Math.max(0, targetYield - aiYield);
  const gapPercent = targetYield > 0 ? Number(((yieldGap / targetYield) * 100).toFixed(1)) : 0;

  const factors = {
    "Soil fertility": soilFactor,
    "Water availability": waterFactor,
    "Temperature stress": tempFactor,
    "Biomass (NDVI)": ndviFactor,
  };
  const limitingFactor = findLimitingFactor(factors);
  const confidencePct = Math.round(clamp(50 + confidence * 45, 50, 97));

  return {
    yield: {
      standardYield: Number(standardYield.toFixed(2)),
      aiYield: Number(aiYield.toFixed(2)),
      unit: profile.unit,
      explanation: t(
        "yield_explanation_short",
        normalizeAdvisoryLanguage(language),
      ),
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
        growth: Number(growthFactor.toFixed(3)),
        health: Number(healthFactor.toFixed(3)),
        ndvi: Number(ndviFactor.toFixed(3)),
        water: Number(waterFactor.toFixed(3)),
        temperature: Number(tempFactor.toFixed(3)),
        soil: Number(soilFactor.toFixed(3)),
      },
    },
  };
}
