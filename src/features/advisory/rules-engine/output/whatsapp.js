import { t } from "../../utils/i18n/advisoryLocale.js";
import { pestName, sanitizeParam } from "./text.js";

const ACTIONABLE_SPRAY = new Set(["SPRAY", "WAIT", "CONSULT"]);
const ACTIONABLE_IRRIGATION = new Set([
  "IRRIGATE",
  "PROTECTIVE",
  "CONSERVE",
  "DRAIN",
  "LIGHT_HEAT",
  "LIGHT_FROST",
  "STOP_HARVEST",
]);

const ALERT_KEYS = {
  "ALT-01": "heavy_rain",
  "ALT-02": "heat",
  "ALT-03": "frost",
  "ALT-04": "wind",
  "ALT-05": "dry_spell",
  "ALT-06": "pest",
  "ALT-07": "waterlog",
  "ALT-08": "sat_stress",
};

/**
 * WhatsApp payloads. Template names come from env so they can be switched on
 * only after Meta approves them (see README → WhatsApp templates).
 *
 * daily  : cg_daily_action  {{1}} name {{2}} crop {{3}} field {{4}} irrigation line {{5}} spray line
 * alert  : cg_alert         {{1}} field {{2}} alert title {{3}} alert message
 * fert   : cg_fertilizer    {{1}} field {{2}} crop {{3}} fertilizer line
 */
export function buildWhatsAppPayloads({ decisions, activities, rules, lang, user, farm, cropName }) {
  const max = Number(rules.settings.whatsapp_param_max_chars) || 160;
  const p = (v) => sanitizeParam(v, max);
  const byType = new Map(activities.map((a) => [a.type, a]));
  const name = user?.firstName || t("rk_wa_farmer", lang);
  const field = farm?.fieldName || t("rk_wa_field", lang);

  const sprayActionable = ACTIONABLE_SPRAY.has(decisions.spray.action);
  const irrigationActionable = ACTIONABLE_IRRIGATION.has(decisions.irrigation.action);
  const irrigationLine = byType.get("IRRIGATION")?.message || t("no_irrigation", lang);
  const sprayLine = byType.get("SPRAY")?.message || t("no_spray", lang);

  const dailyParams = [p(name), p(cropName), p(field), p(irrigationLine), p(sprayLine)];
  const daily = {
    send: sprayActionable || irrigationActionable,
    reason: sprayActionable || irrigationActionable ? "actionable" : "nothing_to_do_today",
    params: dailyParams,
    preview: t("rk_wa_daily_preview", lang, {
      name: dailyParams[0],
      crop: dailyParams[1],
      field: dailyParams[2],
      irrigation: dailyParams[3],
      spray: dailyParams[4],
    }),
  };

  const alerts = decisions.alerts.map((a) => {
    const k = ALERT_KEYS[a.alertId] || "generic";
    const vars = { ...a.vars };
    if (a.alertId === "ALT-06") vars.pest = pestName(a.vars.targetId, rules, lang);
    const title = t(`rk_alert_title_${k}`, lang);
    const message = t(`rk_alert_${k}`, lang, vars);
    const params = [p(field), p(title), sanitizeParam(message, Math.max(max, 300))];
    // The pest alert repeats the spray line of the daily message; when the daily
    // message goes out in the same run, keep the alert in the app only.
    const duplicateOfDaily = a.alertId === "ALT-06" && daily.send && sprayActionable;
    return {
      alertId: a.alertId,
      severity: a.severity,
      send: !duplicateOfDaily,
      params,
      preview: t("rk_wa_alert_preview", lang, { field: params[0], title: params[1], message: params[2] }),
    };
  });

  let fertilizer = null;
  if (decisions.fertilizer.action === "APPLY" && decisions.fertilizer.notifyWhatsApp) {
    const line = byType.get("FERTIGATION")?.message || "";
    const params = [p(field), p(cropName), p(line)];
    fertilizer = {
      params,
      preview: t("rk_wa_fert_preview", lang, { field: params[0], crop: params[1], line: params[2] }),
    };
  }

  return { daily, alerts, fertilizer };
}
