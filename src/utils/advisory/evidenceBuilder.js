/**
 * Evidence Builder - Pre-processing layer for advisory engine.
 * Builds structured evidence JSON from raw data sources.
 * LLM receives ONLY this evidence — no raw satellite data.
 *
 * Now integrates:
 *   - ET₀-based irrigation calculator (FAO Kc)
 *   - BBCH-based fertilizer schedule
 *   - Quantified stress zones
 *   - Enhanced soil moisture with thresholds
 */

import { runDecisionEngine } from "./decisionEngine/index.js";
import { calculateCarbonBalance } from "../carbon/carbonCalculator.js";
import {
  calculateIrrigationRequirement,
  soilMoistureToPercent,
} from "./irrigationCalculator.js";
import { calculateFertilizerSchedule } from "./fertilizerCalculator.js";
import { CROP_CATEGORY_MAP } from "../cropgrowth/cropCategoryMap.js";

/* ---- helpers ---- */
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function normalizeCropName(name) {
  return (name || "").toLowerCase().replace(/[^a-z]/g, "");
}

/**
 * Derive nutrient deficit from npkManagement (required - available).
 * @param {Object} npkManagement
 * @returns {Object} nutrientDeficit with N, P, K in kg/ha
 */
function deriveNutrientDeficit(npkManagement) {
  if (!npkManagement?.available || !npkManagement?.required) {
    return { nitrogenKgPerHa: 0, phosphorousKgPerHa: 0, potassiumKgPerHa: 0 };
  }
  const avail = npkManagement.available;
  const req   = npkManagement.required;
  return {
    nitrogenKgPerHa:     Math.max(0, (req.nitrogenKgPerHa     ?? 0) - (avail.nitrogenKgPerHa     ?? 0)),
    phosphorousKgPerHa:  Math.max(0, (req.phosphorousKgPerHa  ?? 0) - (avail.phosphorousKgPerHa  ?? 0)),
    potassiumKgPerHa:    Math.max(0, (req.potassiumKgPerHa     ?? 0) - (avail.potassiumKgPerHa     ?? 0)),
  };
}

/**
 * Quantify water stress as an estimated percentage of field area stressed.
 * Uses NDMI (water index): below -0.1 = stressed zone proxy.
 * @param {Object} water - parsed water metrics
 * @returns {number} 0–100
 */
function computeWaterStressPercent(water) {
  if (!water) return 0;
  const w = water.waterLatest;
  if (w == null) return 0;
  if (w >= 0.0)  return 0;
  if (w >= -0.1) return 10;
  if (w >= -0.2) return 30;
  if (w >= -0.3) return 55;
  return 80;
}

/**
 * Estimate nitrogen deficiency extent from NDVI relative to expected.
 * @param {Object} ndvi - parsed NDVI metrics
 * @param {string} cropCategory
 * @returns {number} 0–100
 */
function computeNitrogenDeficitPercent(ndvi, cropCategory) {
  if (!ndvi?.ndviLatest) return 0;
  const expected = {
    cereal: 0.55, pulse: 0.50, oilseed: 0.52, vegetable: 0.65, fruit: 0.60, default: 0.55,
  };
  const base = expected[cropCategory] || expected.default;
  const gap = base - ndvi.ndviLatest;
  if (gap <= 0)    return 0;
  if (gap <= 0.05) return 10;
  if (gap <= 0.10) return 25;
  if (gap <= 0.15) return 45;
  return 65;
}

/**
 * Estimate disease pressure from BBCH stage + humidity + temperature.
 * @param {number} bbch
 * @param {Object} weatherSummary
 * @returns {'low'|'moderate'|'high'}
 */
function estimatePestPressure(bbch, weatherSummary) {
  const humidity = weatherSummary?.current?.humidity ?? 60;
  const temp     = weatherSummary?.current?.temp ?? 25;
  const rainfall = weatherSummary?.next7Days?.rainfall?.[0] ?? 0;

  // High risk: flowering–grain fill + warm + humid
  const isSusceptibleStage = bbch >= 40 && bbch <= 80;
  const humidAndWarm = humidity > 75 && temp >= 18 && temp <= 32;
  const recentRain   = rainfall > 5;

  if (isSusceptibleStage && humidAndWarm && recentRain) return "high";
  if (isSusceptibleStage && (humidAndWarm || recentRain)) return "moderate";
  return "low";
}

/**
 * Build enhanced stress zones.
 */
function buildStressZones(ndvi, water, bbch, weatherSummary, cropCategory) {
  const percentageWaterStressed     = computeWaterStressPercent(water);
  const percentageNitrogenDeficient = computeNitrogenDeficitPercent(ndvi, cropCategory);
  const diseasePressure             = estimatePestPressure(bbch ?? 30, weatherSummary);

  const zones = [];
  if (ndvi?.ndviTrend < -0.05 && ndvi?.ndviLatest != null) {
    zones.push({ zone: "field", direction: "declining vegetation", reason: "NDVI trend shows declining crop vigor." });
  }
  if (water?.waterLatest != null && water.waterLatest < -0.1) {
    zones.push({ zone: "field", direction: "water stress", reason: "Water stress detected. Check irrigation." });
  }

  return {
    zones,
    percentageWaterStressed,
    percentageNitrogenDeficient,
    diseasePressure,
  };
}

/**
 * Build structured evidence JSON for LLM advisory engine.
 *
 * @param {Object} params.farmField          - FarmField document
 * @param {Object} params.weatherSummary     - Current + 7-day forecast
 * @param {Object} params.ndvi               - Parsed NDVI metrics
 * @param {Object} params.water              - Parsed water/NDMI metrics
 * @param {Object} params.plantGrowthActivity- GDD-derived stage
 * @param {Object} params.npkManagement      - From npkCalculator
 * @param {Object} params.cropHealth         - From calcCropHealth
 * @param {Object} [params.regionProfile]    - Optional region data
 * @returns {Object} Structured evidence for LLM
 */
export function buildEvidence({
  farmField,
  weatherSummary,
  ndvi,
  water,
  plantGrowthActivity,
  npkManagement,
  cropHealth,
  regionProfile = {},
  yieldGap = null,
}) {
  /* ---- Raw weather values ---- */
  const soilMoistureRaw =
    weatherSummary?.current?.soilMoisture_15cm ??
    weatherSummary?.current?.soilMoisture_5cm ??
    null;

  /* Convert volumetric (m³/m³) → relative available water percent (0–100) */
  const soilMoisturePercent = soilMoistureToPercent(soilMoistureRaw);

  const rainfallNext24h = Array.isArray(weatherSummary?.next7Days?.rainfall)
    ? (weatherSummary.next7Days.rainfall[0] ?? 0)
    : 0;
  const rainfallForecast7d = Array.isArray(weatherSummary?.next7Days?.rainfall)
    ? weatherSummary.next7Days.rainfall.reduce((s, v) => s + (v || 0), 0)
    : 0;
  const et0Today = Array.isArray(weatherSummary?.next7Days?.et0)
    ? (weatherSummary.next7Days.et0[0] ?? weatherSummary?.current?.et0 ?? 4)
    : (weatherSummary?.current?.et0 ?? 4);

  const cropKey      = normalizeCropName(farmField?.cropName);
  const cropCategory = CROP_CATEGORY_MAP[cropKey] || "default";
  const bbchStage    = plantGrowthActivity?.bbchStage ?? 0;

  /* ---- ET₀-based irrigation requirement ---- */
  const irrigationRequirement = calculateIrrigationRequirement({
    cropCategory,
    bbchStage,
    et0: et0Today,
    soilType: "loamy", // default; field model has no soilType field
    soilMoisturePercent,
    rainfallForecast7d,
    rainfallNext24h,
    irrigationType: farmField?.typeOfIrrigation,
    areaAcre: farmField?.acre ?? 1,
  });

  /* ---- Structured soil moisture (with thresholds) ---- */
  const soilMoistureInfo = {
    rawVolumetric: soilMoistureRaw,
    currentPercent: soilMoisturePercent,
    thresholdPermanentWilting: 20,  // % RAW — below = CRITICAL
    thresholdFieldCapacity: 80,     // % RAW — above = DELAY irrigation
    status:
      soilMoisturePercent < 20 ? "CRITICAL"
      : soilMoisturePercent < 40 ? "LOW"
      : soilMoisturePercent > 80 ? "EXCESS"
      : "ADEQUATE",
  };

  /* ---- Nutrient deficit ---- */
  const nutrientDeficit = deriveNutrientDeficit(npkManagement);

  /* ---- Enhanced stress zones ---- */
  const stressZones = buildStressZones(ndvi, water, bbchStage, weatherSummary, cropCategory);

  /* ---- Carbon balance ---- */
  const carbonData = calculateCarbonBalance({
    npkManagement,
    nutrientDeficit,
    irrigationRequirement,
    acre: farmField?.acre ?? 1,
    irrigationType: farmField?.typeOfIrrigation,
    ndviLatest: ndvi?.ndviLatest,
    bbchStage,
    useDieselPump: false,
  });

  /* ---- Harvest stage flag ---- */
  const isHarvestStage =
    (plantGrowthActivity?.stageName ?? "").toLowerCase().match(/maturity|harvest/) != null ||
    bbchStage >= 85;

  /* ---- BBCH-based fertilizer schedule ---- */
  const fertilizerSchedule = calculateFertilizerSchedule({
    cropName: farmField?.cropName || "wheat",
    bbchStage,
    acre: farmField?.acre ?? 1,
    farmingType: farmField?.typeOfFarming ?? "Integrated",
    irrigationType: farmField?.typeOfIrrigation,
  });

  /* ---- Raw evidence (no satellite objects passed to LLM) ---- */
  const rawEvidence = {
    cropType: farmField?.cropName,
    cropGrowthStage: plantGrowthActivity?.stageName ?? "Unknown",
    cropHealth: {
      category: cropHealth?.category,
      percentage: cropHealth?.percentage,
      recommendation: cropHealth?.recommendation,
    },
    soilMoisture: soilMoistureInfo,
    irrigationType: farmField?.typeOfIrrigation,
    weatherForecast: {
      current: weatherSummary?.current,
      next7Days: weatherSummary?.next7Days,
      rainProbabilityToday: rainfallNext24h > 0 ? "likely" : "low",
      windSpeedToday:
        weatherSummary?.next7Days?.windSpeed?.[0] ?? weatherSummary?.current?.windSpeed,
    },
    npkManagement: {
      available:      npkManagement?.available,
      required:       npkManagement?.required,
      recommendation: npkManagement?.recommendation,
    },
    regionProfile,
    stressZones,
    irrigationRequirement,
    nutrientDeficit,
    fertilizerSchedule,
    carbonData,
    yieldGap,
    acre: farmField?.acre,
    variety: farmField?.variety,
    typeOfFarming: farmField?.typeOfFarming ?? "Integrated",
    bbchStage,
  };

  const decisionHints = runDecisionEngine(rawEvidence, isHarvestStage);

  return {
    ...rawEvidence,
    decisionHints,
    isHarvestStage,
  };
}
