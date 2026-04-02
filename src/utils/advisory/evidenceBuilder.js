/**
 * Evidence Builder - Pre-processing layer for advisory engine.
 * Builds structured evidence JSON from raw data sources.
 * LLM receives ONLY this evidence - no raw satellite data.
 */

import { runDecisionEngine } from "./decisionEngine/index.js";
import { calculateCarbonBalance } from "../carbon/carbonCalculator.js";

/**
 * Derive nutrient deficit from npkManagement (required - available).
 * @param {Object} npkManagement - From npkCalculator
 * @returns {Object} nutrientDeficit with N, P, K in kg/ha
 */
function deriveNutrientDeficit(npkManagement) {
  if (!npkManagement?.available || !npkManagement?.required) {
    return { nitrogenKgPerHa: 0, phosphorousKgPerHa: 0, potassiumKgPerHa: 0 };
  }

  const avail = npkManagement.available;
  const req = npkManagement.required;

  return {
    nitrogenKgPerHa: Math.max(0, (req.nitrogenKgPerHa ?? 0) - (avail.nitrogenKgPerHa ?? 0)),
    phosphorousKgPerHa: Math.max(0, (req.phosphorousKgPerHa ?? 0) - (avail.phosphorousKgPerHa ?? 0)),
    potassiumKgPerHa: Math.max(0, (req.potassiumKgPerHa ?? 0) - (avail.potassiumKgPerHa ?? 0)),
  };
}

/**
 * Calculate irrigation requirement based on soil moisture, ET0, rainfall forecast.
 * Returns hours (open) or minutes (drip/sprinkler) as needed.
 * @param {Object} params
 * @returns {Object} { needsIrrigation, amountHours, amountMinutes, reason }
 */
function calculateIrrigationRequirement({
  soilMoisture,
  et0Today,
  rainfallNext24h,
  cropStage,
  irrigationType,
}) {
  const soilDry = soilMoisture == null || soilMoisture < 0.2;
  const rainExpected = (rainfallNext24h ?? 0) > 5; // mm
  const et0 = et0Today ?? 4; // default mm/day

  let needsIrrigation = soilDry && !rainExpected;
  let amountHours = 0;
  let amountMinutes = 0;
  let reason = "Soil moisture adequate.";

  if (needsIrrigation) {
    // Simplified: base hours on ET0 (rough 1 mm ET ≈ 1 hour open irrigation per acre)
    const baseHours = Math.min(4, Math.max(1, Math.round(et0)));
    const isOpen = irrigationType?.toLowerCase?.().includes("open");

    if (isOpen) {
      amountHours = baseHours;
      reason = `Soil moisture low. Give open irrigation for ${amountHours} hours.`;
    } else {
      amountMinutes = baseHours * 45; // drip typically 45 min equivalent per hour
      reason = `Soil moisture low. Run drip/sprinkler for ${amountMinutes} minutes.`;
    }
  } else if (rainExpected) {
    reason = "Rain expected. Skip irrigation today.";
  }

  return {
    needsIrrigation,
    amountHours,
    amountMinutes,
    reason,
    soilMoistureLevel: soilDry ? "low" : "adequate",
  };
}

/**
 * Build stress zones from NDVI/water anomaly (placeholder until zone API exists).
 * Uses temporal trend as proxy: declining NDVI or low water = field-level stress.
 * @param {Object} ndvi - Parsed NDVI metrics
 * @param {Object} water - Parsed water metrics
 * @returns {Array} stressZones - [{ zone: string, reason: string }] or []
 */
function buildStressZones(ndvi, water) {
  const zones = [];

  if (ndvi?.ndviTrend < -0.05 && ndvi?.ndviLatest != null) {
    zones.push({
      zone: "field",
      direction: "declining vegetation",
      reason: "NDVI trend shows declining crop vigor. Inspect for stress.",
    });
  }

  if (water?.waterLatest != null && water.waterLatest < -0.1) {
    zones.push({
      zone: "field",
      direction: "water stress",
      reason: "Water stress detected. Check irrigation and soil moisture.",
    });
  }

  return zones;
}

/**
 * Build structured evidence JSON for LLM advisory engine.
 * NO raw satellite data (ndvi, water objects) - only pre-processed summaries.
 *
 * @param {Object} params
 * @param {Object} params.farmField - FarmField document
 * @param {Object} params.weatherSummary - Current + 7-day forecast
 * @param {Object} params.ndvi - Parsed NDVI (used internally, not passed through)
 * @param {Object} params.water - Parsed water (used internally, not passed through)
 * @param {Object} params.plantGrowthActivity - GDD-derived stage
 * @param {Object} params.npkManagement - From npkCalculator
 * @param {Object} params.cropHealth - From cropHealth
 * @param {Object} params.regionProfile - Optional region data (soil, climate)
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
}) {
  const soilMoisture =
    weatherSummary?.current?.soilMoisture_15cm ??
    weatherSummary?.current?.soilMoisture_5cm ??
    null;

  const rainfallNext24h = Array.isArray(weatherSummary?.next7Days?.rainfall)
    ? weatherSummary.next7Days.rainfall[0]
    : null;
  const et0Today = Array.isArray(weatherSummary?.next7Days?.et0)
    ? weatherSummary.next7Days.et0[0]
    : weatherSummary?.current?.et0;

  const irrigationRequirement = calculateIrrigationRequirement({
    soilMoisture,
    et0Today,
    rainfallNext24h,
    cropStage: plantGrowthActivity?.stageName,
    irrigationType: farmField?.typeOfIrrigation,
  });

  const nutrientDeficit = deriveNutrientDeficit(npkManagement);

  const stressZones = buildStressZones(ndvi, water);

  const carbonData = calculateCarbonBalance({
    npkManagement,
    nutrientDeficit,
    irrigationRequirement,
    acre: farmField?.acre ?? 1,
    irrigationType: farmField?.typeOfIrrigation,
    ndviLatest: ndvi?.ndviLatest,
    bbchStage: plantGrowthActivity?.bbchStage ?? 0,
    useDieselPump: false,
  });

  const isHarvestStage =
    (plantGrowthActivity?.stageName ?? "")
      .toLowerCase()
      .match(/maturity|harvest/) != null ||
    (plantGrowthActivity?.bbchStage ?? 0) >= 85;

  const rawEvidence = {
    cropType: farmField?.cropName,
    cropGrowthStage: plantGrowthActivity?.stageName ?? "Unknown",
    cropHealth: {
      category: cropHealth?.category,
      percentage: cropHealth?.percentage,
      recommendation: cropHealth?.recommendation,
    },
    soilMoisture: soilMoisture ?? "unknown",
    irrigationType: farmField?.typeOfIrrigation,
    weatherForecast: {
      current: weatherSummary?.current,
      next7Days: weatherSummary?.next7Days,
      rainProbabilityToday: rainfallNext24h > 0 ? "likely" : "low",
      windSpeedToday: weatherSummary?.next7Days?.windSpeed?.[0] ?? weatherSummary?.current?.windSpeed,
    },
    npkManagement: {
      available: npkManagement?.available,
      required: npkManagement?.required,
      recommendation: npkManagement?.recommendation,
    },
    regionProfile,
    stressZones,
    irrigationRequirement,
    nutrientDeficit,
    carbonData,
    acre: farmField?.acre,
    variety: farmField?.variety,
    typeOfFarming: farmField?.typeOfFarming ?? "Integrated",
    bbchStage: plantGrowthActivity?.bbchStage,
  };

  const decisionHints = runDecisionEngine(rawEvidence, isHarvestStage);

  return {
    ...rawEvidence,
    decisionHints,
    isHarvestStage,
  };
}
