/**
 * ET₀-based Irrigation Calculator
 * Uses FAO crop coefficients (Kc) per growth phase + soil-type water-holding capacity
 * to compute actual crop water requirement and irrigation schedule.
 *
 * Replaces the heuristic "1mm ET ≈ 1hr" approach in evidenceBuilder.
 */

/**
 * Kc (crop coefficient) by crop category and BBCH growth phase.
 * FAO-56 simplified: initial / dev / mid-season / late-season
 */
const KC_MAP = {
  cereal:    { initial: 0.30, dev: 0.75, mid: 1.15, late: 0.45 },
  pulse:     { initial: 0.40, dev: 0.70, mid: 1.10, late: 0.50 },
  oilseed:   { initial: 0.35, dev: 0.70, mid: 1.15, late: 0.45 },
  vegetable: { initial: 0.50, dev: 0.80, mid: 1.05, late: 0.80 },
  fruit:     { initial: 0.50, dev: 0.75, mid: 1.20, late: 0.75 },
  default:   { initial: 0.40, dev: 0.75, mid: 1.10, late: 0.55 },
};

/**
 * Soil water-holding capacity (mm per 10 cm depth).
 * Assumes 60 cm effective root zone → multiply × 6 for total WHC in mm.
 */
const SOIL_WHC_PER_10CM = {
  sandy:  9,
  loamy:  15,
  clayey: 20,
  default: 13,
};

/** Irrigation system application efficiency (fraction) */
const IRRIGATION_EFFICIENCY = {
  drip:      0.92,
  sprinkler: 0.75,
  flood:     0.58,
  open:      0.58,
  default:   0.72,
};

/**
 * Map BBCH stage (0–99) to FAO growth phase.
 * @param {number} bbch
 * @returns {'initial'|'dev'|'mid'|'late'}
 */
function bbchToPhase(bbch) {
  if (bbch <= 20) return "initial";
  if (bbch <= 45) return "dev";
  if (bbch <= 75) return "mid";
  return "late";
}

/**
 * Resolve irrigation system key from free-text typeOfIrrigation.
 * @param {string} irrigationType
 * @returns {string}
 */
function resolveIrrigationType(irrigationType) {
  const raw = (irrigationType || "").toLowerCase();
  if (raw.includes("drip"))       return "drip";
  if (raw.includes("sprinkler"))  return "sprinkler";
  if (raw.includes("flood"))      return "flood";
  if (raw.includes("open"))       return "open";
  return "default";
}

/**
 * Map "urgency" level based on soil moisture and ET₀.
 * @param {number} soilMoisturePercent  0–100 (relative available water)
 * @param {number} et0                  mm/day
 * @param {number} rainfallNext24h      mm
 * @returns {'CRITICAL'|'HIGH'|'MODERATE'|'LOW'|'SKIP'}
 */
function computeIrrigationUrgency(soilMoisturePercent, et0, rainfallNext24h) {
  if ((rainfallNext24h ?? 0) > 15) return "SKIP";       // rain covers demand
  if (soilMoisturePercent < 25)    return "CRITICAL";
  if (soilMoisturePercent < 40)    return "HIGH";
  if (soilMoisturePercent < 60 && (et0 ?? 4) > 5) return "MODERATE";
  if (soilMoisturePercent >= 75)   return "LOW";
  return "MODERATE";
}

/**
 * Calculate ET₀-based irrigation requirement.
 *
 * @param {Object} params
 * @param {string} params.cropName             - e.g. "wheat"
 * @param {string} params.cropCategory         - 'cereal'|'pulse'|'oilseed'|'vegetable'|'fruit'
 * @param {number} params.bbchStage            - 0–99
 * @param {number} params.et0                  - ET₀ mm/day (FAO Penman-Monteith)
 * @param {string} [params.soilType]           - 'sandy'|'loamy'|'clayey' (defaults to 'loamy')
 * @param {number} params.soilMoisturePercent  - 0–100 relative available water
 * @param {number} params.rainfallForecast7d   - next 7-day total rainfall mm
 * @param {number} params.rainfallNext24h      - next 24h rainfall mm
 * @param {string} params.irrigationType       - free-text from farmField
 * @param {number} [params.areaAcre]           - farm area (for total volume)
 * @returns {Object} Full irrigation recommendation object
 */
export function calculateIrrigationRequirement({
  cropCategory = "default",
  bbchStage = 30,
  et0 = 4,
  soilType = "loamy",
  soilMoisturePercent = 50,
  rainfallForecast7d = 0,
  rainfallNext24h = 0,
  irrigationType = "drip",
  areaAcre = 1,
} = {}) {
  const phase = bbchToPhase(bbchStage);
  const kcTable = KC_MAP[cropCategory] || KC_MAP.default;
  const kc = kcTable[phase];

  /* Crop ET (mm/day) */
  const cropET = Math.max(0, et0 * kc);

  /* Soil water holding capacity over 60 cm root zone (mm) */
  const whcPerUnit = SOIL_WHC_PER_10CM[soilType] || SOIL_WHC_PER_10CM.default;
  const rootZoneWHC = whcPerUnit * 6; // mm total for 60 cm depth

  /* Readily available water (allow 50% depletion before irrigation) */
  const allowableDepletion_mm = rootZoneWHC * 0.5;

  /* Current soil deficit (mm) – how far below field capacity */
  const soilDeficit_mm = rootZoneWHC * Math.max(0, (100 - soilMoisturePercent) / 100);

  /* Net irrigation needed (mm) — crop demand for next 2–3 days minus expected rain */
  const demandDays = 3;
  const grossCropDemand_mm = cropET * demandDays;
  const netIrr_mm = Math.max(
    0,
    Math.max(grossCropDemand_mm - (rainfallForecast7d ?? 0), soilDeficit_mm) - allowableDepletion_mm * 0.2,
  );

  const itype = resolveIrrigationType(irrigationType);
  const efficiency = IRRIGATION_EFFICIENCY[itype] || IRRIGATION_EFFICIENCY.default;

  /* Gross irrigation to apply (mm), accounting for system losses */
  const grossIrr_mm = Math.ceil(netIrr_mm / efficiency);

  /* Convert mm to duration */
  const DELIVERY_MM_PER_HOUR = itype === "drip" || itype === "sprinkler" ? 8 : 12;
  const durationHours = Number((grossIrr_mm / DELIVERY_MM_PER_HOUR).toFixed(1));
  const durationMinutes = Math.round(durationHours * 60);

  /* Irrigation frequency (how often to re-irrigate) */
  const frequencyDays = Math.max(
    2,
    Math.min(7, Math.round(allowableDepletion_mm / Math.max(cropET, 1))),
  );

  /* Discharge rate approximation (L/min per hectare) */
  const areaHa = areaAcre / 2.471;
  const HECTARE_DISCHARGE_LMIN = itype === "drip" ? 250 : itype === "sprinkler" ? 400 : 600;
  const totalDischarge_lmin = Math.round(HECTARE_DISCHARGE_LMIN * areaHa);

  /* Total water volume for this event */
  const totalWater_m3 = Math.round(grossIrr_mm * areaHa * 10);

  const shouldIrrigate = grossIrr_mm > 2 && (rainfallNext24h ?? 0) < 10;
  const criticality = computeIrrigationUrgency(soilMoisturePercent, et0, rainfallNext24h);

  /* Recommendation text for LLM and deterministic override */
  let recommendation;
  if (!shouldIrrigate) {
    if ((rainfallNext24h ?? 0) >= 10) {
      recommendation = "Rain expected (>10 mm). Skip irrigation today.";
    } else {
      recommendation = "Soil moisture adequate. No irrigation needed today.";
    }
  } else {
    const durationLabel =
      itype === "drip" || itype === "sprinkler"
        ? `${durationMinutes} minutes`
        : `${durationHours} hours`;
    recommendation = `Apply ${grossIrr_mm} mm every ${frequencyDays} days for ${durationLabel} (${totalDischarge_lmin} L/min, ~${totalWater_m3} m³ total).`;
  }

  return {
    shouldIrrigate,
    criticality,
    waterRequirement_mm: grossIrr_mm,
    frequencyDays,
    durationHours,
    durationMinutes,
    discharge_lmin: totalDischarge_lmin,
    totalWater_m3,
    cropET_mmPerDay: Number(cropET.toFixed(2)),
    kc,
    phase,
    soilMoisturePercent: Math.round(soilMoisturePercent),
    soilDeficit_mm: Math.round(soilDeficit_mm),
    rainfallOffset_mm: Math.round(rainfallForecast7d ?? 0),
    recommendation,
    /* Legacy keys for backward compat with generateSmartAdvisory.js overrides */
    needsIrrigation: shouldIrrigate,
    amountHours: durationHours,
    amountMinutes: durationMinutes,
    reason: recommendation,
    soilMoistureLevel: soilMoisturePercent < 35 ? "low" : soilMoisturePercent > 70 ? "high" : "adequate",
  };
}

/**
 * Convert raw volumetric soil moisture (m³/m³, typically 0–0.5 from weather APIs)
 * to relative available water percentage (0–100).
 *
 * Wilting point (θ_wp) ≈ 0.10, Field capacity (θ_fc) ≈ 0.32 for loam (defaults used here).
 * @param {number|null} rawVolumetric
 * @returns {number} 0–100
 */
export function soilMoistureToPercent(rawVolumetric) {
  if (rawVolumetric == null || isNaN(rawVolumetric)) return 50; // unknown → assume moderate
  const THETA_WP = 0.10;
  const THETA_FC = 0.32;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  return Math.round(clamp((rawVolumetric - THETA_WP) / (THETA_FC - THETA_WP) * 100, 0, 100));
}
