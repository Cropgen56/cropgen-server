import { createNotification } from "../../../services/notificationCreator.service.js";
import {
  ADVISORY_ACTIVITY_TYPES,
  buildActivityAdvisoryParameters,
} from "../utils/notifications/advisoryNotificationParams.js";

/**
 * WHATSAPP_TEMPLATE_MODE
 *   legacy (default) - existing approved "advisory" template, but ONLY for
 *                      activities that need the farmer to do something.
 *   v2               - new templates (approve them in Meta first):
 *                      cg_daily_action (spray + irrigation in one message),
 *                      cg_alert (one alert), cg_fertilizer (once per stage window).
 */
const MODE = String(process.env.WHATSAPP_TEMPLATE_MODE || "legacy").toLowerCase();
const TEMPLATE_DAILY = process.env.WA_TEMPLATE_DAILY || "cg_daily_action";
const TEMPLATE_ALERT = process.env.WA_TEMPLATE_ALERT || "cg_alert";
const TEMPLATE_FERT = process.env.WA_TEMPLATE_FERT || "cg_fertilizer";

/** With the condition monitor on, it owns all alerts (as events with lifecycle); the daily advisory sends none. */
function monitorOwnsAlerts() {
  return String(process.env.CONDITION_MONITOR_ENABLED || "false").toLowerCase() === "true";
}

function sendableAlerts(engineResult) {
  if (monitorOwnsAlerts()) return [];
  return (engineResult.whatsapp.alerts || []).filter((a) => a.send);
}

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

/** Which of the legacy per-activity messages are worth sending today. */
export function actionableLegacyTypes(engineResult) {
  const d = engineResult.decisions;
  const types = new Set();
  if (ACTIONABLE_SPRAY.has(d.spray.action)) types.add("SPRAY");
  if (ACTIONABLE_IRRIGATION.has(d.irrigation.action)) types.add("IRRIGATION");
  if (d.fertilizer.action === "APPLY" && d.fertilizer.notifyWhatsApp) types.add("FERTIGATION");
  if (sendableAlerts(engineResult).length) types.add("WEATHER");
  return ADVISORY_ACTIVITY_TYPES.filter((t) => types.has(t));
}

async function send(task, sent, label) {
  try {
    await task();
    sent.push(label);
  } catch (err) {
    console.error(`[Advisory] notification ${label} failed:`, err?.message || err);
  }
}

/**
 * Send the engine's farmer messages. Returns the list of what went out.
 * @param {object} p
 * @param {object} p.user  user doc (lean) with phone / language
 * @param {object} p.farmField farm field doc
 * @param {object} p.advisory saved FarmAdvisory
 * @param {object} p.engineResult output of runRulesEngine
 */
export async function sendEngineNotifications({ user, farmField, advisory, engineResult }) {
  const sent = [];
  if (!user?.phone) return { mode: MODE, sent };
  const wa = engineResult.whatsapp;

  if (MODE === "v2") {
    if (wa.daily?.send) {
      await send(
        () => createNotification({ user, type: "ADVISORY", referenceId: advisory._id, templateName: TEMPLATE_DAILY, parameters: wa.daily.params }),
        sent,
        "daily",
      );
    }
    for (const alert of sendableAlerts(engineResult)) {
      await send(
        () => createNotification({ user, type: "ADVISORY", referenceId: advisory._id, templateName: TEMPLATE_ALERT, parameters: alert.params }),
        sent,
        `alert:${alert.alertId}`,
      );
    }
    if (wa.fertilizer) {
      await send(
        () => createNotification({ user, type: "ADVISORY", referenceId: advisory._id, templateName: TEMPLATE_FERT, parameters: wa.fertilizer.params }),
        sent,
        "fertilizer",
      );
    }
    return { mode: MODE, sent };
  }

  // legacy: existing "advisory" template, one message per actionable activity.
  const firstAlert = sendableAlerts(engineResult)[0];
  for (const type of actionableLegacyTypes(engineResult)) {
    // The WEATHER slot carries the alert text (title + message), not the general outlook.
    const activity =
      type === "WEATHER" && firstAlert
        ? { type, title: firstAlert.params[1], message: firstAlert.params[2], details: {} }
        : advisory.activitiesToDo.find((a) => a.type === type);
    if (!activity) continue;
    await send(
      () =>
        createNotification({
          user,
          type: "ADVISORY",
          referenceId: advisory._id,
          templateName: "advisory",
          parameters: buildActivityAdvisoryParameters(user, farmField, activity),
        }),
      sent,
      `legacy:${type}`,
    );
  }
  return { mode: MODE, sent };
}
