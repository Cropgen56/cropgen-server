import { CROP_YIELD_PROFILE } from "./cropYieldProfile.js";

/* ---------- Helpers ---------- */
const acreToHectare = (acre) => acre / 2.47105;
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const normalizeCropName = (name) =>
  name?.toLowerCase().replace(/[^a-z]/g, "");

/** NPK model: available ≈ required × stress factors — ratio reflects fulfillment vs stage need (not “more N required = worse”). */
function nutrientBalanceFactor(npkManagement) {
  const req = npkManagement?.required;
  if (!req) return 1;
  const reqSum =
    (Number(req.nitrogenKgPerHa) || 0) +
    (Number(req.phosphorousKgPerHa) || 0) +
    (Number(req.potassiumKgPerHa) || 0);
  if (reqSum <= 0) return 1;

  const av = npkManagement?.available;
  const avSum = av
    ? (Number(av.nitrogenKgPerHa) || 0) +
      (Number(av.phosphorousKgPerHa) || 0) +
      (Number(av.potassiumKgPerHa) || 0)
    : 0;

  const cover = avSum / reqSum;
  return clamp(0.78 + 0.22 * clamp(cover, 0, 1.12), 0.74, 1.05);
}

/* ---------- NDVI Ranges by Crop Category ---------- */
const NDVI_CATEGORY_RANGES = {
  cereal:    { low: 0.45, high: 0.75 },
  pulse:     { low: 0.35, high: 0.65 },
  oilseed:   { low: 0.40, high: 0.70 },
  vegetable: { low: 0.55, high: 0.85 },
  fruit:     { low: 0.50, high: 0.80 },
  default:   { low: 0.40, high: 0.70 },
};

/* ---------- Explanation i18n ---------- */
function getYieldExplanation(language = "en") {
  if (language === "mr")
    return "मानक: पिक प्रोफाइलनुसार हेक्टर दर × शेत क्षेत्र. AI: वाढ, आरोग्य, हिरवळ, पाणी, पोषक तत्वे नुसार दुरुस्ती.";
  if (language === "hi")
    return "मानक: फसल प्रोफ़ाइल के अनुसार प्रति हेक्टर × खेत क्षेत्र। AI: वृद्धि, स्वास्थ्य, हरियाली, पानी, पोषक तत्वों से समायोजन।";
  return "Standard yield = crop profile benchmark (per hectare) × farm area. AI yield adjusts that using growth, health, greenness, water, and nutrients.";
}

/* ---------- MAIN ---------- */
export function calculateYield({
  farmField,
  cropHealth,
  plantGrowthActivity,
  npkManagement,
  ndvi,
  water,
  language = "en",
}) {
  const cropKey = normalizeCropName(farmField.cropName);
  const profile = CROP_YIELD_PROFILE[cropKey] ?? CROP_YIELD_PROFILE.default;

  const areaHa = acreToHectare(farmField.acre);

  /* ---------- 1. Growth factor: season-end style projection (avoid crushing early BBCH with a hard 0.3 floor) ---------- */
  const progress = (plantGrowthActivity?.overallProgress ?? 0) / 100;
  const growthFactor = clamp(
    0.65 + 0.35 * Math.sqrt(Math.max(progress, 0.02)),
    0.65,
    1
  );

  /* ---------- 2. Crop Health Factor ---------- */
  const healthFactor = clamp(0.75 + cropHealth.score * 0.4, 0.75, 1.1);

  /* ---------- 3. NDVI Factor (Category-aware) ---------- */
  const category = profile.category || "default";
  const ndviRange = NDVI_CATEGORY_RANGES[category] || NDVI_CATEGORY_RANGES.default;
  let ndviFactor = 1;

  if (ndvi?.ndviLatest != null) {
    if (ndvi.ndviLatest < ndviRange.low) ndviFactor = 0.85;
    else if (ndvi.ndviLatest > ndviRange.high) ndviFactor = 1.05;
  }

  /* ---------- 4. Water Factor ---------- */
  const waterFactor =
    water?.waterLatest < 0.05 ? 0.75 :
    water?.waterLatest < 0.15 ? 0.9 : 1;

  /* ---------- 5. Nutrition: use estimated fulfillment (available vs required), not raw requirement size ---------- */
  const nutrientFactor = nutrientBalanceFactor(npkManagement);

  /* ---------- 6. Standard yield: profile benchmark × farm area only (hectares) ---------- */
  const standardYield = profile.baseYieldPerHa * areaHa;

  /* ---------- 7. AI yield: standard × field signals + narrow confidence band ---------- */
  const fieldFactor =
    growthFactor * healthFactor * ndviFactor * waterFactor * nutrientFactor;

  const confidence =
    (cropHealth.score +
      clamp(ndvi?.ndviLatest ?? 0.5, 0, 1) +
      clamp(water?.waterLatest ?? 0.5, 0, 1)) / 3;

  const aiBand = clamp(0.93 + confidence * 0.09, 0.93, 1.07);
  const aiYield = standardYield * fieldFactor * aiBand;

  return {
    yield: {
      standardYield: Number(standardYield.toFixed(2)),
      aiYield: Number(aiYield.toFixed(2)),
      unit: profile.unit,
      explanation: getYieldExplanation(language),
    },
  };
}
