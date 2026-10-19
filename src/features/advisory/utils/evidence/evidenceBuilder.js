import { runDecisionEngine } from "./decisionEngine/index.js";
import { calculateCarbonBalance } from "../../../../utils/carbon/carbonCalculator.js";
import {
  calculateIrrigationRequirement,
  soilMoistureToPercent,
} from "./irrigationCalculator.js";
import { calculateFertilizerSchedule } from "./fertilizerCalculator.js";
import { CROP_CATEGORY_MAP } from "../../../../utils/crop/growth/cropCategoryMap.js";
import { normalizeAdvisoryLanguage } from "../i18n/advisoryLanguages.js";
import { resolveIrrigationFamily } from "../../../../constants/farmEnums.js";

function normalizeCropName(name) {
  return (name || "").toLowerCase().replace(/[^a-z]/g, "");
}

function deriveNutrientDeficit(npkManagement) {
  if (!npkManagement?.available || !npkManagement?.required) {
    return { nitrogenKgPerHa: 0, phosphorousKgPerHa: 0, potassiumKgPerHa: 0 };
  }
  const avail = npkManagement.available;
  const req = npkManagement.required;
  return {
    nitrogenKgPerHa: Math.max(0, (req.nitrogenKgPerHa ?? 0) - (avail.nitrogenKgPerHa ?? 0)),
    phosphorousKgPerHa: Math.max(
      0,
      (req.phosphorousKgPerHa ?? 0) - (avail.phosphorousKgPerHa ?? 0),
    ),
    potassiumKgPerHa: Math.max(0, (req.potassiumKgPerHa ?? 0) - (avail.potassiumKgPerHa ?? 0)),
  };
}

function computeWaterStressPercent(water) {
  if (!water) return 0;
  const w = water.waterLatest;
  if (w == null) return 0;
  if (w >= 0.0) return 0;
  if (w >= -0.1) return 10;
  if (w >= -0.2) return 30;
  if (w >= -0.3) return 55;
  return 80;
}

function nitrogenStressFromOptical(opticalIndicesSummary) {
  const nitrogen = opticalIndicesSummary?.indices?.NITROGEN;
  if (nitrogen?.healthScore == null) return null;
  const score = nitrogen.healthScore;
  if (score >= 72) return 0;
  if (score >= 55) return 15;
  if (score >= 42) return 30;
  if (score >= 28) return 50;
  return 65;
}

function computeNitrogenDeficitPercent(ndvi, cropCategory, opticalIndicesSummary) {
  const opticalN = nitrogenStressFromOptical(opticalIndicesSummary);
  if (opticalN != null) return opticalN;

  if (!ndvi?.ndviLatest) return 0;
  const expected = {
    cereal: 0.55,
    pulse: 0.5,
    oilseed: 0.52,
    vegetable: 0.65,
    fruit: 0.6,
    default: 0.55,
  };
  const base = expected[cropCategory] || expected.default;
  const gap = base - ndvi.ndviLatest;
  if (gap <= 0) return 0;
  if (gap <= 0.05) return 10;
  if (gap <= 0.1) return 25;
  if (gap <= 0.15) return 45;
  return 65;
}

function estimatePestPressure(bbch, weatherSummary) {
  const humidity = weatherSummary?.current?.humidity ?? 60;
  const temp = weatherSummary?.current?.temp ?? 25;
  const rainfall = weatherSummary?.next7Days?.rainfall?.[0] ?? 0;

  const isSusceptibleStage = bbch >= 40 && bbch <= 80;
  const humidAndWarm = humidity > 75 && temp >= 18 && temp <= 32;
  const recentRain = rainfall > 5;

  if (isSusceptibleStage && humidAndWarm && recentRain) return "high";
  if (isSusceptibleStage && (humidAndWarm || recentRain)) return "moderate";
  return "low";
}

function buildStressZones(ndvi, water, bbch, weatherSummary, cropCategory, opticalIndicesSummary) {
  const percentageWaterStressed = computeWaterStressPercent(water);
  const percentageNitrogenDeficient = computeNitrogenDeficitPercent(
    ndvi,
    cropCategory,
    opticalIndicesSummary,
  );
  const diseasePressure = estimatePestPressure(bbch ?? 30, weatherSummary);

  const zones = [];
  if (ndvi?.ndviTrend < -0.05 && ndvi?.ndviLatest != null) {
    zones.push({
      zone: "field",
      direction: "declining vegetation",
      reason: "NDVI trend shows declining crop vigor.",
    });
  }
  if (water?.waterLatest != null && water.waterLatest < -0.1) {
    zones.push({
      zone: "field",
      direction: "water stress",
      reason: "Water stress detected. Check irrigation.",
    });
  }

  return {
    zones,
    percentageWaterStressed,
    percentageNitrogenDeficient,
    diseasePressure,
  };
}

/**
 * Builds agronomic evidence payload without LLM decision hints (modules 5–6 add those).
 */
export function buildEvidencePayload({
  farmField,
  weatherSummary,
  ndvi,
  water,
  plantGrowthActivity,
  npkManagement,
  cropHealth,
  regionProfile = {},
  yieldGap = null,
  opticalIndicesSummary = null,
}) {
  const soilMoistureRaw =
    weatherSummary?.current?.soilMoisture_15cm ??
    weatherSummary?.current?.soilMoisture_5cm ??
    null;

  const hasObservedSoilMoisture = soilMoistureRaw != null && Number.isFinite(soilMoistureRaw);
  const soilMoisturePercent = soilMoistureToPercent(soilMoistureRaw);

  const rainfallNext24h = Array.isArray(weatherSummary?.next7Days?.rainfall)
    ? (weatherSummary.next7Days.rainfall[0] ?? 0)
    : 0;
  const rainfallForecast7d = Array.isArray(weatherSummary?.next7Days?.rainfall)
    ? weatherSummary.next7Days.rainfall.reduce((s, v) => s + (v || 0), 0)
    : 0;
  const rainfallForecast3d = Array.isArray(weatherSummary?.next7Days?.rainfall)
    ? weatherSummary.next7Days.rainfall.slice(0, 3).reduce((s, v) => s + (v || 0), 0)
    : 0;
  const et0Today = Array.isArray(weatherSummary?.next7Days?.et0)
    ? (weatherSummary.next7Days.et0[0] ?? weatherSummary?.current?.et0 ?? 4)
    : (weatherSummary?.current?.et0 ?? 4);

  const cropKey = normalizeCropName(farmField?.cropName);
  const cropCategory = CROP_CATEGORY_MAP[cropKey] || "default";
  const bbchStage = plantGrowthActivity?.bbchStage ?? 0;

  const soilType =
    regionProfile?.soilType ||
    regionProfile?.soilTexture ||
    farmField?.soilType ||
    "loamy";

  const irrigationRequirement = calculateIrrigationRequirement({
    cropCategory,
    bbchStage,
    et0: et0Today,
    soilType: String(soilType).toLowerCase(),
    soilMoisturePercent,
    rainfallForecast7d,
    rainfallForecast3d,
    rainfallNext24h,
    irrigationType: farmField?.typeOfIrrigation,
    areaAcre: farmField?.acre ?? 1,
    hasObservedSoilMoisture,
  });

  const soilMoistureInfo = {
    rawVolumetric: soilMoistureRaw,
    currentPercent: soilMoisturePercent,
    observed: hasObservedSoilMoisture,
    thresholdPermanentWilting: 20,
    thresholdFieldCapacity: 80,
    status:
      soilMoisturePercent < 20
        ? "CRITICAL"
        : soilMoisturePercent < 40
          ? "LOW"
          : soilMoisturePercent > 80
            ? "EXCESS"
            : "ADEQUATE",
  };

  const nutrientDeficit = deriveNutrientDeficit(npkManagement);
  const stressZones = buildStressZones(
    ndvi,
    water,
    bbchStage,
    weatherSummary,
    cropCategory,
    opticalIndicesSummary,
  );

  const irrigationFamily = resolveIrrigationFamily(farmField?.typeOfIrrigation);
  const useDieselPump = irrigationFamily === "flood";

  const carbonData = calculateCarbonBalance({
    npkManagement,
    nutrientDeficit,
    irrigationRequirement,
    acre: farmField?.acre ?? 1,
    irrigationType: farmField?.typeOfIrrigation,
    ndviLatest: ndvi?.ndviLatest,
    bbchStage,
    useDieselPump,
  });

  const isHarvestStage =
    (plantGrowthActivity?.stageName ?? "").toLowerCase().match(/maturity|harvest/) != null ||
    bbchStage >= 85;

  const fertilizerSchedule = calculateFertilizerSchedule({
    cropName: farmField?.cropName || "wheat",
    bbchStage,
    acre: farmField?.acre ?? 1,
    farmingType: farmField?.typeOfFarming ?? "Integrated",
    irrigationType: farmField?.typeOfIrrigation,
  });

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
      rainProbabilityToday:
        rainfallNext24h >= 8
          ? "high"
          : rainfallNext24h >= 2
            ? "moderate"
            : "low",
      rainfallForecast3d,
      rainfallForecast7d,
      windSpeedToday:
        weatherSummary?.next7Days?.windSpeed?.[0] ?? weatherSummary?.current?.windSpeed,
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
    fertilizerSchedule,
    carbonData,
    yieldGap,
    acre: farmField?.acre,
    variety: farmField?.variety,
    typeOfFarming: farmField?.typeOfFarming ?? "Integrated",
    bbchStage,
    satelliteOpticalIndices: opticalIndicesSummary,
    dataQuality: {
      hasObservedSoilMoisture,
      irrigationConfidence: irrigationRequirement?.dataConfidence || "high",
    },
  };

  return { rawEvidence, isHarvestStage };
}

/**
 * Attaches decision engine output; optional overrides from fertilizer/spray modules.
 */
export function finalizeEvidence({
  rawEvidence,
  isHarvestStage,
  language = "en",
  decisionOverrides = null,
}) {
  const decisionHints = runDecisionEngine(rawEvidence, isHarvestStage);

  if (decisionOverrides?.fertigation) {
    decisionHints.fertigation = decisionOverrides.fertigation;
  }
  if (decisionOverrides?.spray) {
    decisionHints.spray = decisionOverrides.spray;
  }

  return {
    ...rawEvidence,
    language: normalizeAdvisoryLanguage(language),
    decisionHints,
    isHarvestStage,
  };
}

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
  opticalIndicesSummary = null,
  language = "en",
}) {
  const { rawEvidence, isHarvestStage } = buildEvidencePayload({
    farmField,
    weatherSummary,
    ndvi,
    water,
    plantGrowthActivity,
    npkManagement,
    cropHealth,
    regionProfile,
    yieldGap,
    opticalIndicesSummary,
  });

  return finalizeEvidence({ rawEvidence, isHarvestStage, language });
}
