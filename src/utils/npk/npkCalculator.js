import { CROP_PROFILES } from "./cropProfiles.js";
import { STAGE_RANGES } from "./stageRanges.js";
import { CROP_CATEGORY_MAP } from "../crop/growth/cropCategoryMap.js";
import { acresToHectares } from "./npkArea.js";

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
  switch (language) {
    case "mr":
      return `पीक: ${cropName}
वाढीची अवस्था: ${stageName}
क्षेत्रफळ: ${areaAcre.toFixed(2)} एकर

उपग्रह माहितीनुसार पिकावर ताण दिसत आहे.
पिकाच्या सध्याच्या अवस्थेनुसार नत्र, स्फुरद व पालाश नियोजनबद्ध पद्धतीने द्या.
सिंचनासोबतच खत व्यवस्थापन केल्यास उत्पादन सुधारेल.`;

    case "hi":
      return `फसल: ${cropName}
विकास अवस्था: ${stageName}
क्षेत्रफल: ${areaAcre.toFixed(2)} एकड़

उपग्रह आंकड़ों के अनुसार फसल पर तनाव दिखाई दे रहा है।
फसल की अवस्था के अनुसार नाइट्रोजन, फॉस्फोरस और पोटाश दें।
सिंचाई के साथ संतुलित पोषण प्रबंधन करें।`;

    default:
      return `Crop: ${cropName}
Growth stage: ${stageName}
Area: ${areaAcre.toFixed(2)} acres

Satellite data indicates nutrient stress in the crop.
Apply nitrogen, phosphorus, and potassium as per the current growth stage.
Balanced fertilization along with proper irrigation will improve yield.`;
  }
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
  const acre = Number(areaAcre);
  const acreStr = Number.isFinite(acre) ? acre.toFixed(2) : "0.00";

  switch (language) {
    case "mr":
      return `पीक: ${cropName}
वाढीची अवस्था: ${stageName}
क्षेत्रफळ: ${acreStr} एकर

शेतात सध्या उभी पिक नाही (रानटी जमीन).
योजित पीक: ${cropName} — पेरणीपूर्व बेसल खताची तयारी करा.
सडलेले FYM/कंपोस्ट (एकात्मिक/सेंद्रिय शेती) आणि DAP/SSP/युरिया/MOP माती चाचणीनुसार.
पेरणीच्या 1–3 दिवस आधी किंवा पेरणीसोबत बियाणे खोलीवर मिसळा.
हलके सिंचन; पाणथळ टाळा.`;

    case "hi":
      return `फसल: ${cropName}
विकास अवस्था: ${stageName}
क्षेत्रफल: ${acreStr} एकड़

खेत में अभी खड़ी फसल नहीं है (खाली/रानटी खेत)।
योजित फसल: ${cropName} — बुवाई से पहले बेसल उर्वरक की तैयारी करें।
सड़ा हुआ FYM/कम्पोस्ट (एकीकृत या जैविक खेती) और DAP/SSP/यूरिया/MOP मिट्टी परीक्षण के अनुसार।
बुवाई के 1–3 दिन पहले या बुवाई के समय बीज बिस्तर में मिलाएं।
हल्की सिंचाई के साथ; जलभराव से बचें।`;

    default:
      return `Crop: ${cropName}
Growth stage: ${stageName}
Area: ${acreStr} acres

No standing crop in the field (barren / fallow).
Planned crop: ${cropName} — prepare basal fertilizer before sowing.
Apply well-decomposed FYM/compost (integrated/organic farms) and DAP/SSP/Urea/MOP per soil test.
Incorporate 1–3 days before sowing or at sowing in the seedbed.
Light irrigation if needed; avoid waterlogging.`;
  }
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
  switch (language) {
    case "mr":
      return `पीक: ${cropName}
अवस्था: ${stageName}
क्षेत्रफळ: ${areaAcre.toFixed(2)} एकर

पीक काढणीस तयार आहे.
या टप्प्यावर कोणतेही रासायनिक खत देऊ नका.
योग्य वेळेत काढणी करून साठवण व विक्रीची तयारी करा.`;

    case "hi":
      return `फसल: ${cropName}
अवस्था: ${stageName}
क्षेत्रफल: ${areaAcre.toFixed(2)} एकड़

फसल कटाई के लिए तैयार है।
इस अवस्था में कोई भी उर्वरक न दें।
समय पर कटाई और भंडारण की तैयारी करें।`;

    default:
      return `Crop: ${cropName}
Stage: ${stageName}
Area: ${areaAcre.toFixed(2)} acres

The crop is ready for harvest.
Do not apply fertilizers at this stage.
Plan timely harvesting and post-harvest handling.`;
  }
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
