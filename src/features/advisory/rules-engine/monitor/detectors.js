/**
 * Condition detectors. Each takes the current snapshot (+ previous snapshot)
 * and returns zero or more candidate events:
 *   { type, key, severity, confidence, evidence[], causes[], vars }
 *
 * Every number used comes from Settings / Monitoring Rules in the workbook.
 */
import { daysBetween } from "./signals.js";

const SEVERITY_RANK = { Info: 0, Low: 1, Medium: 2, High: 3 };

export function maxSeverity(a, b) {
  return (SEVERITY_RANK[a] ?? 0) >= (SEVERITY_RANK[b] ?? 0) ? a : b;
}
export { SEVERITY_RANK };

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function ev(source, metric, current, previous = null, extra = {}) {
  return { source, metric, current, previous, ...extra };
}

/**
 * Rank likely causes of weak / falling vigour from the other signals.
 * Returns [{ key, vars, score }] best first. Used in the farmer message.
 */
export function likelyCauses(snap) {
  const causes = [];
  const w = snap.water || {};
  const ndmi = snap.s2?.NDMI;
  if ((ndmi?.change !== null && ndmi?.change !== undefined && ndmi.change <= -snap.settings.mon_ndmi_drop) ||
      (w.depletionMm !== null && w.depletionMm !== undefined && w.rawMm && w.depletionMm >= w.rawMm)) {
    causes.push({ key: "water", score: 0.8 });
  }
  const pest = snap.pest?.top;
  if (pest && (pest.risk === "HIGH" || pest.risk === "MODERATE")) {
    causes.push({ key: "pest", vars: { targetId: pest.targetId }, score: pest.risk === "HIGH" ? 0.75 : 0.5 });
  }
  if (snap.weather?.heatDaysPast5 > 0) causes.push({ key: "heat", score: 0.6 + 0.05 * Math.min(4, snap.weather.heatDaysPast5) });
  if ((snap.weather?.rainPast5 ?? 0) >= snap.settings.drain_rain_3d_mm || snap.flags?.sarWaterlog) {
    causes.push({ key: "waterlog", score: 0.7 });
  }
  const ndre = snap.s2?.NDRE;
  if (ndre?.change !== null && ndre?.change !== undefined && ndre.change <= -snap.settings.mon_ndre_drop) {
    causes.push({ key: "nutrient", score: 0.55 });
  }
  causes.sort((a, b) => b.score - a.score);
  return causes.length ? causes : [{ key: "unknown", score: 0 }];
}

/** Confidence from how many independent sources agree. */
function confidence(base, corroborations) {
  return Number(clamp(base + 0.15 * corroborations, 0.3, 0.95).toFixed(2));
}

export function detectVegetationDrop(snap) {
  const s = snap.settings;
  const ndvi = snap.s2?.NDVI;
  if (!ndvi || ndvi.stale || ndvi.change === null || snap.bbch >= 80) return [];
  const drop = -ndvi.change;
  if (drop < s.mon_veg_drop_medium) return [];
  const causes = likelyCauses(snap);
  const sarAgrees = snap.s1 && snap.s1.vhChange !== null && snap.s1.vhChange <= -1.5;
  const corroborate = (causes[0].key !== "unknown" ? 1 : 0) + (sarAgrees ? 1 : 0);
  return [{
    type: "VEG_DROP",
    key: "VEG_DROP",
    severity: drop >= s.mon_veg_drop_high ? "High" : "Medium",
    confidence: confidence(0.5, corroborate),
    causes,
    vars: {
      pct: Math.round((drop / Math.max(ndvi.reference.value, 0.05)) * 100),
      date: ndvi.reference.date,
    },
    evidence: [
      ev("Sentinel-2", "NDVI", ndvi.value, ndvi.reference.value, { date: ndvi.date, previousDate: ndvi.reference.date }),
      ...(sarAgrees ? [ev("Sentinel-1", "VH dB change", snap.s1.vhChange, null, { date: snap.s1.date })] : []),
    ],
  }];
}

export function detectBelowExpected(snap, prev) {
  const ndvi = snap.s2?.NDVI;
  const exp = snap.expected?.NDVI;
  if (!ndvi || ndvi.stale || !exp || snap.bbch < 20 || snap.bbch >= 80) return [];
  const tol = exp.tolerance ?? snap.settings.mon_expected_tolerance;
  const gap = exp.value - ndvi.value;
  if (gap < tol) return [];
  const persistent = Boolean(prev?.flags?.belowExpected);
  const causes = likelyCauses(snap);
  return [{
    type: "VEG_BELOW_EXPECTED",
    key: "VEG_BELOW_EXPECTED",
    severity: persistent ? "High" : "Medium",
    confidence: confidence(0.45, (persistent ? 1 : 0) + (causes[0].key !== "unknown" ? 1 : 0)),
    causes,
    vars: { value: ndvi.value.toFixed(2), expected: exp.value.toFixed(2) },
    evidence: [ev("Sentinel-2", "NDVI vs expected", ndvi.value, null, { expected: exp.value, date: ndvi.date, bbch: snap.bbch })],
    flag: "belowExpected",
  }];
}

export function detectWaterStress(snap) {
  const s = snap.settings;
  const ndmi = snap.s2?.NDMI;
  const w = snap.water || {};
  if (snap.irrigation?.family === undefined && !ndmi) return [];
  const satDry = ndmi && !ndmi.stale && snap.bbch >= 20 && snap.bbch < 85 &&
    ((ndmi.change !== null && ndmi.change <= -s.mon_ndmi_drop) || ndmi.value <= s.mon_ndmi_low);
  const balanceDry = w.depletionMm !== null && w.depletionMm !== undefined && w.rawMm > 0 && w.depletionMm >= w.rawMm;
  if (!satDry && !(balanceDry && snap.irrigation?.critical)) return [];
  const both = satDry && balanceDry;
  return [{
    type: "WATER_STRESS",
    key: "WATER_STRESS",
    severity: both || snap.irrigation?.critical ? "High" : "Medium",
    confidence: confidence(0.5, (satDry ? 1 : 0) + (balanceDry ? 1 : 0) - 1),
    vars: { satDry, balanceDry },
    evidence: [
      ...(satDry ? [ev("Sentinel-2", "NDMI", ndmi.value, ndmi.reference?.value ?? null, { date: ndmi.date })] : []),
      ...(balanceDry ? [ev("Water balance", "Root-zone depletion (mm)", w.depletionMm, null, { readilyAvailableMm: w.rawMm })] : []),
    ],
    flag: "waterStress",
  }];
}

export function detectNitrogenStress(snap) {
  const s = snap.settings;
  const ndre = snap.s2?.NDRE;
  const ndvi = snap.s2?.NDVI;
  if (!ndre || ndre.stale || ndre.change === null || !ndvi || ndvi.change === null) return [];
  if (snap.bbch < 20 || snap.bbch > 59) return [];
  if (ndre.change > -s.mon_ndre_drop || Math.abs(ndvi.change) >= s.mon_ndvi_stable) return [];
  return [{
    type: "N_STRESS",
    key: "N_STRESS",
    severity: "Medium",
    confidence: confidence(0.45, snap.fertilizer?.action === "APPLY" ? 1 : 0),
    vars: {},
    evidence: [
      ev("Sentinel-2", "NDRE", ndre.value, ndre.reference?.value ?? null, { date: ndre.date }),
      ev("Sentinel-2", "NDVI change", ndvi.change, null, { date: ndvi.date }),
    ],
  }];
}

export function detectSarEvents(snap) {
  const s = snap.settings;
  const sar = snap.s1;
  if (!sar || sar.stale) return [];
  const out = [];
  const openWater = sar.vv !== null && sar.vv <= s.mon_sar_water_vv_db;
  const wetDrop = sar.vvChange !== null && sar.vvChange <= -s.mon_sar_drop_db && (snap.weather?.rainPast5 ?? 0) >= s.mon_sar_flood_rain_mm;
  if (openWater || wetDrop) {
    out.push({
      type: "WATERLOG_SAR",
      key: "WATERLOG_SAR",
      severity: snap.crop?.waterloggingSensitivity === "High" || snap.crop?.group === "PUL" ? "High" : "Medium",
      confidence: confidence(0.55, (openWater ? 1 : 0) + ((snap.weather?.rainPast5 ?? 0) >= s.mon_sar_flood_rain_mm ? 1 : 0)),
      vars: {},
      evidence: [ev("Sentinel-1", "VV dB", sar.vv, sar.prev?.vv ?? null, { date: sar.date, rainPast5Mm: snap.weather?.rainPast5 ?? null })],
      flag: "sarWaterlog",
    });
  } else if (
    sar.vhChange !== null && sar.vhChange <= -s.mon_sar_drop_db && snap.bbch >= 30 && snap.bbch <= 89
  ) {
    out.push({
      type: "CANOPY_LOSS_SAR",
      key: "CANOPY_LOSS_SAR",
      severity: "High",
      confidence: confidence(0.5, snap.s2?.NDVI?.change !== null && snap.s2?.NDVI?.change <= -s.mon_veg_drop_medium ? 1 : 0),
      vars: {},
      evidence: [ev("Sentinel-1", "VH dB", sar.vh, sar.prev?.vh ?? null, { date: sar.date, previousDate: sar.prev?.date })],
    });
  }
  return out;
}

export function detectStageChange(snap, prev) {
  if (!prev || prev.principalStage === null || prev.principalStage === undefined) return [];
  if (snap.principalStage <= prev.principalStage) return [];
  return [{
    type: "STAGE_CHANGE",
    key: `STAGE_CHANGE:${snap.principalStage}`,
    severity: snap.criticalStage ? "Medium" : "Info",
    confidence: Number((snap.stageConfidence ?? 0.6).toFixed(2)),
    vars: { stage: snap.stageName || `BBCH ${snap.bbch}`, critical: snap.criticalStage },
    evidence: [ev("Growth model", "BBCH", snap.bbch, prev.bbch, { gdd: snap.cumulativeGDD })],
  }];
}

export function detectGrowthDelay(snap) {
  const s = snap.settings;
  if (snap.gddBbch === null || snap.gddBbch === undefined || snap.ndviBbch === null || snap.ndviBbch === undefined) return [];
  if ((snap.ndviConfidence ?? 0) < 0.5) return [];
  const lag = snap.gddBbch - snap.ndviBbch;
  if (lag < s.mon_stage_delay_bbch) return [];
  return [{
    type: "GROWTH_DELAY",
    key: "GROWTH_DELAY",
    severity: "Medium",
    confidence: confidence(0.45, 0),
    causes: likelyCauses(snap),
    vars: { lag },
    evidence: [ev("Growth model", "BBCH from heat (GDD) vs from satellite", snap.gddBbch, snap.ndviBbch)],
  }];
}

export function detectPestRiskRising(snap, prev) {
  const prevRisk = new Map((prev?.pest?.risks || []).map((r) => [r.targetId, r.risk]));
  return (snap.pest?.risks || [])
    .filter((r) => r.risk === "HIGH" && prevRisk.get(r.targetId) !== "HIGH")
    .slice(0, 2)
    .map((r) => ({
      type: "PEST_RISK",
      key: `PEST_RISK:${r.targetId}`,
      severity: "High",
      confidence: confidence(0.5, (r.consecutiveDays ?? 0) >= 3 ? 1 : 0),
      vars: { targetId: r.targetId, sprayAction: snap.spray?.action || "NONE" },
      evidence: [ev("Weather", "Days matching disease/pest window", r.consecutiveDays ?? null, null, { ruleId: r.ruleId })],
    }));
}

export function detectIrrigationCritical(snap) {
  if (snap.irrigation?.action !== "IRRIGATE" || !snap.irrigation?.critical) return [];
  return [{
    type: "IRRIGATION_CRITICAL",
    key: "IRRIGATION_CRITICAL",
    severity: "High",
    confidence: confidence(0.55, snap.s2?.NDMI?.change !== null && snap.s2?.NDMI?.change <= -snap.settings.mon_ndmi_drop ? 1 : 0),
    vars: {},
    evidence: [ev("Water balance", "Root-zone depletion (mm)", snap.water?.depletionMm ?? null, null, { readilyAvailableMm: snap.water?.rawMm ?? null })],
  }];
}

export function detectTaskOverdue(snap) {
  const s = snap.settings;
  const since = snap.sprayAdvisedSince;
  if (!since || snap.spray?.action !== "SPRAY") return [];
  const days = daysBetween(since, snap.date);
  if (days < s.mon_task_overdue_days) return [];
  return [{
    type: "TASK_OVERDUE",
    key: `TASK_OVERDUE:${snap.pest?.top?.targetId || "spray"}`,
    severity: "Medium",
    confidence: 0.8,
    vars: { targetId: snap.pest?.top?.targetId, date: since, days },
    evidence: [ev("Operations", "Days since spray advised, not marked done", days, null)],
  }];
}

const WEATHER_ALERT_EVENTS = {
  "ALT-01": "WEATHER_HEAVY_RAIN",
  "ALT-02": "WEATHER_HEAT",
  "ALT-03": "WEATHER_FROST",
  "ALT-04": "WEATHER_WIND",
  "ALT-05": "WEATHER_DRY_SPELL",
  "ALT-07": "WEATHER_WATERLOG",
};

export function detectWeather(snap) {
  return (snap.weatherAlerts || [])
    .filter((a) => WEATHER_ALERT_EVENTS[a.alertId])
    .map((a) => ({
      type: WEATHER_ALERT_EVENTS[a.alertId],
      key: WEATHER_ALERT_EVENTS[a.alertId],
      severity: a.severity || "High",
      confidence: 0.7,
      vars: a.vars || {},
      evidence: [ev("Weather forecast", a.alertId, a.vars || null, null)],
      alertId: a.alertId,
    }));
}

export function detectNoClearScene(snap) {
  const days = snap.s2?.daysSinceClear;
  if (days === null || days === undefined || days < snap.settings.mon_no_clear_scene_days) return [];
  return [{
    type: "NO_CLEAR_SCENE",
    key: "NO_CLEAR_SCENE",
    severity: "Info",
    confidence: 1,
    vars: { days },
    evidence: [ev("Sentinel-2", "Days since last clear scene", days, null)],
  }];
}

export const DETECTORS = [
  detectWeather,
  detectPestRiskRising,
  detectIrrigationCritical,
  detectSarEvents,
  detectVegetationDrop,
  detectBelowExpected,
  detectWaterStress,
  detectNitrogenStress,
  detectStageChange,
  detectGrowthDelay,
  detectTaskOverdue,
  detectNoClearScene,
];
