const KC_MAP = {
  cereal: { initial: 0.3, dev: 0.75, mid: 1.15, late: 0.45 },
  pulse: { initial: 0.4, dev: 0.7, mid: 1.1, late: 0.5 },
  oilseed: { initial: 0.35, dev: 0.7, mid: 1.15, late: 0.45 },
  vegetable: { initial: 0.5, dev: 0.8, mid: 1.05, late: 0.8 },
  fruit: { initial: 0.5, dev: 0.75, mid: 1.2, late: 0.75 },
  default: { initial: 0.4, dev: 0.75, mid: 1.1, late: 0.55 },
};

const SOIL_WHC_PER_10CM = {
  sandy: 9,
  loamy: 15,
  clayey: 20,
  default: 13,
};

const IRRIGATION_EFFICIENCY = {
  drip: 0.92,
  sprinkler: 0.75,
  flood: 0.58,
  open: 0.58,
  default: 0.72,
};

function bbchToPhase(bbch) {
  if (bbch <= 20) return "initial";
  if (bbch <= 45) return "dev";
  if (bbch <= 75) return "mid";
  return "late";
}

function resolveIrrigationType(irrigationType) {
  const raw = (irrigationType || "").toLowerCase();
  if (raw.includes("drip")) return "drip";
  if (raw.includes("sprinkler")) return "sprinkler";
  if (raw.includes("flood")) return "flood";
  if (raw.includes("open")) return "open";
  return "default";
}

function computeIrrigationUrgency(soilMoisturePercent, et0, rainfallNext24h) {
  if ((rainfallNext24h ?? 0) > 15) return "SKIP";
  if (soilMoisturePercent < 25) return "CRITICAL";
  if (soilMoisturePercent < 40) return "HIGH";
  if (soilMoisturePercent < 60 && (et0 ?? 4) > 5) return "MODERATE";
  if (soilMoisturePercent >= 75) return "LOW";
  return "MODERATE";
}

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
  const cropET = Math.max(0, et0 * kc);

  const whcPerUnit = SOIL_WHC_PER_10CM[soilType] || SOIL_WHC_PER_10CM.default;
  const rootZoneWHC = whcPerUnit * 6;
  const allowableDepletion_mm = rootZoneWHC * 0.5;
  const soilDeficit_mm = rootZoneWHC * Math.max(0, (100 - soilMoisturePercent) / 100);

  const demandDays = 3;
  const grossCropDemand_mm = cropET * demandDays;
  const netIrr_mm = Math.max(
    0,
    Math.max(grossCropDemand_mm - (rainfallForecast7d ?? 0), soilDeficit_mm) -
      allowableDepletion_mm * 0.2,
  );

  const itype = resolveIrrigationType(irrigationType);
  const efficiency = IRRIGATION_EFFICIENCY[itype] || IRRIGATION_EFFICIENCY.default;
  const grossIrr_mm = Math.ceil(netIrr_mm / efficiency);

  const DELIVERY_MM_PER_HOUR = itype === "drip" || itype === "sprinkler" ? 8 : 12;
  const durationHours = Number((grossIrr_mm / DELIVERY_MM_PER_HOUR).toFixed(1));
  const durationMinutes = Math.round(durationHours * 60);
  const frequencyDays = Math.max(2, Math.min(7, Math.round(allowableDepletion_mm / Math.max(cropET, 1))));

  const areaHa = areaAcre / 2.471;
  const HECTARE_DISCHARGE_LMIN = itype === "drip" ? 250 : itype === "sprinkler" ? 400 : 600;
  const totalDischarge_lmin = Math.round(HECTARE_DISCHARGE_LMIN * areaHa);
  const totalWater_m3 = Math.round(grossIrr_mm * areaHa * 10);
  const shouldIrrigate = grossIrr_mm > 2 && (rainfallNext24h ?? 0) < 10;
  const criticality = computeIrrigationUrgency(soilMoisturePercent, et0, rainfallNext24h);

  let recommendation;
  if (!shouldIrrigate) {
    recommendation =
      (rainfallNext24h ?? 0) >= 10
        ? "Rain expected (>10 mm). Skip irrigation today."
        : "Soil moisture adequate. No irrigation needed today.";
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
    needsIrrigation: shouldIrrigate,
    amountHours: durationHours,
    amountMinutes: durationMinutes,
    reason: recommendation,
    soilMoistureLevel:
      soilMoisturePercent < 35 ? "low" : soilMoisturePercent > 70 ? "high" : "adequate",
  };
}

export function soilMoistureToPercent(rawVolumetric) {
  if (rawVolumetric == null || isNaN(rawVolumetric)) return 50;
  const THETA_WP = 0.1;
  const THETA_FC = 0.32;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  return Math.round(clamp(((rawVolumetric - THETA_WP) / (THETA_FC - THETA_WP)) * 100, 0, 100));
}
