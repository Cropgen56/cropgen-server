import { dayAt, daysWithoutRain, sumField } from "../features/weather.js";

function inCooldown(alertId, cooldownHours, history, now) {
  const last = history.alertsSent
    .filter((a) => a.alertId === alertId)
    .map((a) => new Date(a.sentAt).getTime())
    .sort((a, b) => b - a)[0];
  if (!last) return false;
  return now.getTime() - last < (cooldownHours || 24) * 3600 * 1000;
}

/**
 * Evaluate weather/pest alerts. Returns fired alerts (already filtered for
 * cooldown and the Active flag in the workbook).
 */
/** At a critical stage the crop's own heat / cold limit (Crops tab) applies if it is stricter than the general one. */
function stageLimits(crop, bbch, s) {
  const critical = (crop?.criticalBbch || []).some(([lo, hi]) => bbch >= lo && bbch <= hi);
  const heat = critical && Number.isFinite(crop?.heatLimitC) ? Math.min(s.heat_alert_c, crop.heatLimitC) : s.heat_alert_c;
  const cold = critical && Number.isFinite(crop?.coldLimitC) ? Math.max(s.frost_alert_c, crop.coldLimitC) : s.frost_alert_c;
  return { heat, cold, critical };
}

export function evaluateAlerts({ rules, crop, bbch = 0, family, series, spray, irrigation, satellite, history, now }) {
  const s = rules.settings;
  const limits = stageLimits(crop, Number(bbch) || 0, s);
  const today = dayAt(series, 0) || {};
  const tomorrow = dayAt(series, 1) || {};
  const rain24 = today.rain ?? 0;
  const rain3 = sumField(series, "rain", 0, 2);
  const tmax = today.tmax;
  const tminNext = Math.min(today.tmin ?? 99, tomorrow.tmin ?? 99);
  const wind = Math.max(today.wind ?? 0, today.gust ?? 0);

  const candidates = [];
  if (rain24 >= s.heavy_rain_24h_mm || rain3 >= s.heavy_rain_3d_mm) {
    candidates.push({ alertId: "ALT-01", vars: { rain: Math.round(Math.max(rain24, rain3)) } });
  }
  if (tmax !== null && tmax !== undefined && tmax >= limits.heat) {
    candidates.push({ alertId: "ALT-02", vars: { tmax: Math.round(tmax), cropLimit: limits.heat < s.heat_alert_c } });
  }
  if (tminNext <= limits.cold) {
    candidates.push({ alertId: "ALT-03", vars: { tmin: Math.round(tminNext), cropLimit: limits.cold > s.frost_alert_c } });
  }
  if (wind >= s.wind_alert_kmh) candidates.push({ alertId: "ALT-04", vars: { wind: Math.round(wind) } });

  const dry = daysWithoutRain(series);
  if (
    family === "rainfed" &&
    dry !== null &&
    dry >= s.dry_spell_days &&
    irrigation?.depletionMm !== null &&
    irrigation?.rawMm &&
    irrigation.depletionMm >= irrigation.rawMm
  ) {
    candidates.push({ alertId: "ALT-05", vars: { days: dry } });
  }
  if (spray?.top?.risk === "HIGH" && ["SPRAY", "WAIT"].includes(spray.action)) {
    candidates.push({
      alertId: "ALT-06",
      targetId: spray.top.targetId,
      vars: { targetId: spray.top.targetId, product: spray.product?.name || "", dose: spray.product?.dose || "" },
    });
  }
  if (crop?.waterloggingSensitivity === "High" && rain3 >= s.drain_rain_3d_mm) {
    candidates.push({ alertId: "ALT-07", vars: { rain: Math.round(rain3) } });
  }
  if (satellite?.ndviDropVsExpected != null && satellite.ndviDropVsExpected >= 0.1) {
    candidates.push({ alertId: "ALT-08", vars: {} });
  }

  const fired = [];
  for (const c of candidates) {
    const def = rules.alerts[c.alertId];
    if (!def || !def.active) continue;
    if (inCooldown(c.alertId, def.cooldownHours, history, now)) continue;
    fired.push({ ...c, severity: def.severity, cooldownHours: def.cooldownHours, sentAt: now.toISOString() });
  }
  // Heavy rain makes the waterlogging alert redundant on the same day.
  if (fired.some((a) => a.alertId === "ALT-01")) {
    return fired.filter((a) => a.alertId !== "ALT-07");
  }
  return fired;
}
