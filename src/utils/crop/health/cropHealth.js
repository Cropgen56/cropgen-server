import { CROP_CATEGORY_MAP } from "../growth/cropCategoryMap.js";
import {
  t,
  normalizeAdvisoryLanguage,
} from "../../../features/advisory/utils/i18n/advisoryLocale.js";

/* =========================================================
   CONSTANTS (SCIENCE-BASED, SIMPLE)
========================================================= */

/* NDVI ranges by crop category */
const NDVI_RANGES = {
  cereal: { low: 0.45, high: 0.75 },
  pulse: { low: 0.35, high: 0.65 },
  oilseed: { low: 0.4, high: 0.7 },
  vegetable: { low: 0.55, high: 0.85 },
  fruit: { low: 0.5, high: 0.8 },
  default: { low: 0.45, high: 0.75 },
};

/* =========================================================
   HEAT TOLERANCE LIMITS (°C) – CROP-WISE
   Meaning: Temperature above which heat stress begins
========================================================= */

export const HEAT_LIMIT = {
  /* ---------- Cereals & Millets ---------- */
  wheat: 32,
  rice: 35,
  corn: 35,
  barley: 30,
  pearlmillet: 38,
  sorghum: 38,
  fingermillet: 35,

  /* ---------- Sugar & Fiber ---------- */
  sugarcane: 38,
  cotton: 40,
  jute: 35,
  tobacco: 35,

  /* ---------- Pulses ---------- */
  chickpea: 30,
  greengram: 35,
  blackgram: 35,
  lentil: 30,
  horsegram: 38,
  cowpealobia: 35,
  kidneybeansrajma: 30,
  redgram: 35,
  greenpeas: 25,
  beans: 30,

  /* ---------- Oilseeds ---------- */
  groundnut: 35,
  mustard: 30,
  sunflower: 38,
  sesame: 38,
  linseed: 30,
  castor: 38,
  safflower: 32,
  niger: 35,
  chia: 30,

  /* ---------- Vegetables (Cool season) ---------- */
  cabbage: 25,
  cauliflower: 25,
  broccoli: 25,
  lettuce: 22,
  spinach: 25,
  carrot: 25,
  beetroot: 25,
  radish: 25,
  turnip: 25,
  celery: 25,
  onion: 30,
  garlic: 30,
  potato: 25,

  /* ---------- Vegetables (Warm season) ---------- */
  tomato: 35,
  brinjal: 35,
  chilli: 35,
  capsicum: 30,
  okra: 38,
  cucumber: 35,
  pumpkin: 38,
  bottlelourd: 38,
  bittergourd: 38,
  spongegourd: 38,
  ashgourd: 38,
  snakegourd: 38,
  squashmelon: 35,
  summersquash: 35,
  sweetpotato: 35,
  longmelon: 35,
  mushroom: 28, // substrate temp sensitive

  /* ---------- Fruits (Tropical) ---------- */
  banana: 38,
  papaya: 38,
  mango: 38,
  guava: 35,
  sapota: 38,
  coconut: 38,
  arecanut: 35,
  pineapple: 35,
  dragonfruit: 40,
  amla: 38,

  /* ---------- Fruits (Subtropical / Temperate) ---------- */
  grapes: 35,
  pomegranate: 38,
  watermelon: 38,
  muskmelon: 38,
  orange: 32,
  lemon: 35,
  fig: 35,
  apple: 30,
  kiwi: 28,

  /* ---------- Plantation & Spices ---------- */
  turmeric: 35,
  ginger: 35,
  coriander: 30,
  cumin: 32,
  fenugreekmethi: 30,
  blackpepper: 32,
  tea: 30,
  coffee: 30,
  rubber: 35,

  /* ---------- Default ---------- */
  default: 35,
};

/* =========================================================
   HELPERS
========================================================= */

function normalizeCropName(name) {
  return name?.toLowerCase().replace(/[^a-z]/g, "");
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

/* =========================================================
   NDVI SCORE (CROP + STAGE AWARE)
========================================================= */

function ndviScore({ ndviLatest, ndviTrend }, cropCategory, bbchStage) {
  const range = NDVI_RANGES[cropCategory] || NDVI_RANGES.default;
  let score;

  if (ndviLatest < range.low) score = 50;
  else if (ndviLatest < range.high) score = 75;
  else score = 90;

  /* Early stage tolerance */
  if (bbchStage <= 30) score += 5;

  /* NDVI declining trend penalty */
  if (ndviTrend < -0.05) score -= 10;

  /* Late stage sensitivity */
  if (bbchStage >= 60 && ndviLatest < range.low) score -= 10;

  return clamp(score, 40, 95);
}

/* =========================================================
   WATER SCORE (DURATION BASED)
========================================================= */

function waterScore({ waterLatest, stressDays = 0 }) {
  let score = 85;

  if (waterLatest < -0.1) score -= 30;
  else if (waterLatest < 0.05) score -= 15;

  if (stressDays >= 5) score -= 15;

  return clamp(score, 40, 90);
}

/* =========================================================
   WEATHER SCORE (CROP-AWARE)
========================================================= */

function weatherScore(weather, cropName) {
  let score = 90;
  const heatLimit = HEAT_LIMIT[cropName] || HEAT_LIMIT.default;

  if (weather.current.temp > heatLimit) score -= 20;
  if (weather.current.temp < 10) score -= 10;

  const noRain =
    Array.isArray(weather.next7Days.rainfall) &&
    weather.next7Days.rainfall.every((r) => r === 0);

  if (noRain) score -= 5;

  return clamp(score, 50, 90);
}

/* =========================================================
   NUTRIENT (NPK) SCORE
========================================================= */

function nutrientScore(npkManagement) {
  if (!npkManagement?.required) return 85;

  const req = npkManagement.required;
  const reqN = Number(req.nitrogenKgPerHa) || 0;
  const reqP = Number(req.phosphorousKgPerHa) || 0;
  const reqK = Number(req.potassiumKgPerHa) || 0;
  const totalR = reqN + reqP + reqK;
  if (totalR <= 0) return 90;

  const av = npkManagement.available || {};
  const avN = Number(av.nitrogenKgPerHa) || 0;
  const avP = Number(av.phosphorousKgPerHa) || 0;
  const avK = Number(av.potassiumKgPerHa) || 0;

  const nD = Math.max(0, reqN - avN);
  const pD = Math.max(0, reqP - avP);
  const kD = Math.max(0, reqK - avK);
  const totalD = nD + pD + kD;
  const deficitRatio = totalD / totalR;

  if (deficitRatio < 0.1) return 90;
  if (deficitRatio < 0.25) return 78;
  if (deficitRatio < 0.45) return 65;
  return 52;
}

/* =========================================================
   HEALTH CATEGORY + MESSAGE
========================================================= */

function getHealthCategory(score) {
  if (score >= 85) return "Excellent";
  if (score >= 70) return "Good";
  if (score >= 50) return "Moderate";
  if (score >= 30) return "Poor";
  return "Critical";
}

function getHealthRecommendation(category, language = "en") {
  const lang = normalizeAdvisoryLanguage(language);
  const key = `health_recommendation_${String(category).toLowerCase()}`;
  return t(key, lang);
}

/* =========================================================
   MAIN EXPORT
========================================================= */

export function calcCropHealth({
  ndvi,
  water,
  weatherSummary,
  plantGrowthActivity,
  npkManagement,
  farmField,
  language = "en",
  opticalIndicesSummary = null,
  satelliteHealthSignal = null,
}) {
  const satHealth = Number(satelliteHealthSignal?.health);
  if (Number.isFinite(satHealth)) {
    const pct = Math.round(clamp(satHealth, 0, 100));
    const category = getHealthCategory(pct);
    return {
      score: Number((pct / 100).toFixed(2)),
      percentage: pct,
      category,
      recommendation: getHealthRecommendation(category, language),
    };
  }

  const cropKey = normalizeCropName(farmField?.cropName);
  const cropCategory = CROP_CATEGORY_MAP[cropKey] || "vegetable";

  const ndviS = ndviScore(
    {
      ndviLatest: ndvi.ndviLatest,
      ndviTrend: ndvi.ndviTrend ?? 0,
    },
    cropCategory,
    plantGrowthActivity.bbchStage,
  );

  const waterS = waterScore({
    waterLatest: water.waterLatest,
    stressDays: water.stressDays ?? 0,
  });

  const weatherS = weatherScore(weatherSummary, cropKey);

  const nutrientS = nutrientScore(npkManagement);

  /* ---------- Weighted Health ---------- */
  let percentage =
    ndviS * 0.35 + waterS * 0.25 + weatherS * 0.2 + nutrientS * 0.2;

  const compositeOptical = opticalIndicesSummary?.compositeVegetationScore;
  if (Number.isFinite(compositeOptical)) {
    percentage = percentage * 0.82 + compositeOptical * 0.18;
  }

  const rounded = Math.round(percentage);
  const category = getHealthCategory(rounded);

  return {
    score: Number((rounded / 100).toFixed(2)),
    percentage: rounded,
    category,
    recommendation: getHealthRecommendation(category, language),
  };
}
