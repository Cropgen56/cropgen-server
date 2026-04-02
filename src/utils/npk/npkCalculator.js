import { CROP_PROFILES } from "./cropProfiles.js";
import { STAGE_RANGES } from "./stageRanges.js";
import { CROP_CATEGORY_MAP } from "../cropgrowth/cropCategoryMap.js";

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
  language = "en",
}) {
  const cropName = normalizeCropName(farmField.cropName);
  const crop = CROP_PROFILES[cropName];
  if (!crop) throw new Error(`Crop not supported: ${farmField.cropName}`);

  const { bbchStage, stageName } = plantGrowthActivity;
  const areaHa = farmField.acre / 2.47105;

  /* ---------- Harvest stage ---------- */
  if (bbchStage >= crop.maturityBBCH) {
    return {
      available: { nitrogenKgPerHa: 0, phosphorousKgPerHa: 0, potassiumKgPerHa: 0 },
      required: { nitrogenKgPerHa: 0, phosphorousKgPerHa: 0, potassiumKgPerHa: 0 },
      recommendation: getHarvestStageRecommendation({
        cropName: farmField.cropName,
        stageName,
        areaAcre: farmField.acre,
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

  const { hsi, nFactor, pFactor, kFactor } = calculateHSI({
    ndvi: ndviLatest,
    waterIndex: waterLatest,
    bbchStage,
    expectedNDVI,
  });

  const available = {
    nitrogenKgPerHa: Number((required.nitrogenKgPerHa * nFactor).toFixed(1)),
    phosphorousKgPerHa: Number((required.phosphorousKgPerHa * pFactor).toFixed(1)),
    potassiumKgPerHa: Number((required.potassiumKgPerHa * kFactor).toFixed(1)),
  };

  return {
    available,
    required,
    hsi, // useful for UI / confidence
    recommendation: getNPKRecommendation({
      cropName: farmField.cropName,
      stageName,
      areaAcre: farmField.acre,
      language,
    }),
  };
}
