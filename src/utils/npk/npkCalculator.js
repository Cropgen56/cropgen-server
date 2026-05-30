import { CROP_PROFILES } from "./cropProfiles.js";
import { STAGE_RANGES } from "./stageRanges.js";
import { CROP_CATEGORY_MAP } from "../crop/growth/cropCategoryMap.js";
import { acresToHectares } from "./npkArea.js";
import {
  t,
  normalizeAdvisoryLanguage,
  localizeGrowStageName,
} from "../../features/advisory/utils/i18n/advisoryLocale.js";

/* ------------------ Helpers ------------------ */

export function normalizeCropName(name) {
  if (!name) return "";
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/* ------------------ HSI LOGIC ------------------ */

// Nitrogen stress from NDVI
function nitrogenHSI(ndvi, expected = 0.55) {
  const diff = ndvi - expected;
  if (diff < -0.15) return 0.55;
  if (diff < -0.08) return 0.7;
  if (diff < 0) return 0.85;
  return 1.0;
}

// Potassium stress from water
function potassiumHSI(waterIndex) {
  if (waterIndex < -0.1) return 0.6;
  if (waterIndex < 0.05) return 0.8;
  return 1.0;
}

// Phosphorus timing stress from stage
function phosphorusHSI(bbchStage) {
  if (bbchStage < 30) return 0.75;
  if (bbchStage < 50) return 0.85;
  return 0.9;
}

// Overall Health Stress Index (0–1)
function calculateHSI({ ndvi, waterIndex, bbchStage, expectedNDVI }) {
  const n = nitrogenHSI(ndvi, expectedNDVI);
  const p = phosphorusHSI(bbchStage);
  const k = potassiumHSI(waterIndex);

  return {
    hsi: Number(((n + p + k) / 3).toFixed(2)),
    nFactor: n,
    pFactor: p,
    kFactor: k,
  };
}

/* ------------------ Recommendations ------------------ */

function getNPKRecommendation({ cropName, stageName, areaAcre, language }) {
  const lang = normalizeAdvisoryLanguage(language);
  const localizedStage = localizeGrowStageName(stageName, lang);
  return t("npk_standing_crop", lang, {
    cropName,
    stageName: localizedStage,
    areaAcre: Number(areaAcre).toFixed(2),
  });
}

/**
 * Formatted NPK block for barren land (pre-sowing) — same layout as standing-crop advisories.
 */
export function getBarrenLandNPKRecommendation({
  cropName,
  stageName,
  areaAcre,
  language = "en",
}) {
  const lang = normalizeAdvisoryLanguage(language);
  const acre = Number(areaAcre);
  const acreStr = Number.isFinite(acre) ? acre.toFixed(2) : "0.00";
  const localizedStage = localizeGrowStageName(stageName, lang);

  return t("npk_barren_land", lang, {
    cropName,
    stageName: localizedStage,
    areaAcre: acreStr,
  });
}

/**
 * NPK numbers (early-stage plan) + formatted pre-sowing recommendation text.
 */
export function buildBarrenLandNpkFromField({
  farmField,
  plantGrowthActivity,
  ndvi = null,
  water = null,
  weatherSummary = null,
  language = "en",
}) {
  const stageName =
    plantGrowthActivity?.stageName || "Pre-sowing (barren land)";
  let calc = null;

  try {
    calc = calculateNPKFromfarmField({
      farmField,
      ndviLatest: ndvi?.ndviLatest ?? 0.25,
      waterLatest: water?.waterLatest ?? 0,
      plantGrowthActivity: {
        bbchStage: 12,
        stageName,
      },
      weatherSummary,
      language,
    });
  } catch {
    // Crop not in NPK profile — text-only recommendation
  }

  return {
    mode: "pre_sowing_basal",
    available: calc?.available ?? null,
    required: calc?.required ?? null,
    deficit: calc?.deficit ?? null,
    hsi: calc?.hsi ?? null,
    area: calc?.area ?? null,
    factorSource: calc?.factorSource ?? "fallback_hsi",
    satelliteNpk: calc?.satelliteNpk ?? null,
    recommendation: getBarrenLandNPKRecommendation({
      cropName: farmField?.cropName || "crop",
      stageName,
      areaAcre: farmField?.acre ?? 1,
      language,
    }),
  };
}

function getHarvestStageRecommendation({ cropName, stageName, areaAcre, language }) {
  const lang = normalizeAdvisoryLanguage(language);
  const localizedStage = localizeGrowStageName(stageName, lang);
  return t("npk_harvest_stage", lang, {
    cropName,
    stageName: localizedStage,
    areaAcre: Number(areaAcre).toFixed(2),
  });
}

/* ------------------ MAIN FUNCTION ------------------ */

export function calculateNPKFromfarmField({
  farmField,
  ndviLatest,
  waterLatest,
  plantGrowthActivity,
  weatherSummary,
  satelliteNpkAvailability = null,
  language = "en",
}) {
  const cropName = normalizeCropName(farmField.cropName);
  const crop = CROP_PROFILES[cropName];
  if (!crop) throw new Error(`Crop not supported: ${farmField.cropName}`);

  const { bbchStage, stageName } = plantGrowthActivity;
  const areaAcre = Number(farmField?.acre) || 0;
  const areaHectare = acresToHectares(areaAcre);

  /* ---------- Harvest stage ---------- */
  if (bbchStage >= crop.maturityBBCH) {
    const required = {
      nitrogenKgPerHa: 0,
      phosphorousKgPerHa: 0,
      potassiumKgPerHa: 0,
    };
    const available = {
      nitrogenKgPerHa: 0,
      phosphorousKgPerHa: 0,
      potassiumKgPerHa: 0,
    };
    return {
      available,
      required,
      deficit: required,
      area: { acre: areaAcre, hectare: areaHectare },
      recommendation: getHarvestStageRecommendation({
        cropName: farmField.cropName,
        stageName,
        areaAcre,
        language,
      }),
    };
  }

  /* ---------- Stage resolution ---------- */
  const category = CROP_CATEGORY_MAP[cropName] || "vegetable";
  const ranges = STAGE_RANGES[category] || STAGE_RANGES.vegetable;

  let stage = Object.keys(ranges).find(
    s => bbchStage >= ranges[s].min && bbchStage < ranges[s].max
  ) || Object.keys(ranges).at(-1);

  /* ---------- REQUIRED NPK ---------- */
  const base = {
    N: crop.totalNPK.N * crop.stageSplit[stage].N,
    P: crop.totalNPK.P * crop.stageSplit[stage].P,
    K: crop.totalNPK.K * crop.stageSplit[stage].K,
  };

  const waterFactor = waterLatest < -0.1 ? 0.7 : 1.0;
  const finalPerHa = {
    N: base.N * waterFactor,
    P: base.P * waterFactor,
    K: base.K * waterFactor,
  };

  const required = {
    nitrogenKgPerHa: Number(finalPerHa.N.toFixed(1)),
    phosphorousKgPerHa: Number(finalPerHa.P.toFixed(1)),
    potassiumKgPerHa: Number(finalPerHa.K.toFixed(1)),
  };

  /* ---------- HSI-based AVAILABLE NPK ---------- */
  const expectedNDVI = crop.ndviExpected[stage] || 0.55;

  const hsiFallback = calculateHSI({
    ndvi: ndviLatest,
    waterIndex: waterLatest,
    bbchStage,
    expectedNDVI,
  });

  const nutrientFactorsFromSatellite = {
    nFactor: satelliteNpkAvailability?.nutrients?.nitrogen?.factor,
    pFactor: satelliteNpkAvailability?.nutrients?.phosphorous?.factor,
    kFactor: satelliteNpkAvailability?.nutrients?.potassium?.factor,
  };
  const nFactor = Number.isFinite(nutrientFactorsFromSatellite.nFactor)
    ? nutrientFactorsFromSatellite.nFactor
    : hsiFallback.nFactor;
  const pFactor = Number.isFinite(nutrientFactorsFromSatellite.pFactor)
    ? nutrientFactorsFromSatellite.pFactor
    : hsiFallback.pFactor;
  const kFactor = Number.isFinite(nutrientFactorsFromSatellite.kFactor)
    ? nutrientFactorsFromSatellite.kFactor
    : hsiFallback.kFactor;
  const hsi = Number(((nFactor + pFactor + kFactor) / 3).toFixed(2));

  const available = {
    nitrogenKgPerHa: Number((required.nitrogenKgPerHa * nFactor).toFixed(1)),
    phosphorousKgPerHa: Number((required.phosphorousKgPerHa * pFactor).toFixed(1)),
    potassiumKgPerHa: Number((required.potassiumKgPerHa * kFactor).toFixed(1)),
  };

  const deficit = {
    nitrogenKgPerHa: Math.max(
      0,
      Number((required.nitrogenKgPerHa - available.nitrogenKgPerHa).toFixed(1)),
    ),
    phosphorousKgPerHa: Math.max(
      0,
      Number(
        (required.phosphorousKgPerHa - available.phosphorousKgPerHa).toFixed(1),
      ),
    ),
    potassiumKgPerHa: Math.max(
      0,
      Number((required.potassiumKgPerHa - available.potassiumKgPerHa).toFixed(1)),
    ),
  };

  return {
    available,
    required,
    deficit,
    hsi, // useful for UI / confidence
    factorSource: satelliteNpkAvailability ? "satellite" : "fallback_hsi",
    area: { acre: areaAcre, hectare: areaHectare },
    satelliteNpk: satelliteNpkAvailability
      ? {
          date: satelliteNpkAvailability.date,
          nutrients: satelliteNpkAvailability.nutrients,
        }
      : null,
    recommendation: getNPKRecommendation({
      cropName: farmField.cropName,
      stageName,
      areaAcre,
      language,
    }),
  };
}
