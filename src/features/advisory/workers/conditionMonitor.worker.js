import cron from "node-cron";
import FarmField from "../../../models/field.model.js";
import FieldCrop from "../../../models/field-crop.model.js";
import UserSubscription from "../../../models/user-subscription.model.js";
import FieldConditionSnapshot from "../models/fieldConditionSnapshot.model.js";
import { getImageAvailability } from "../client/satellite.client.js";
import { resolveAdvisoryApiGeometry } from "../../../utils/geometry/farmGeometry.js";
import { formatDateISO } from "../utils/shared/helpers.js";
import { enqueueConditionCheck, startConditionMonitorQueueWorker } from "../queue/conditionMonitor.queue.js";

/**
 * Real-time scheduling for the crop condition monitor.
 *
 *   MONITOR_WEATHER_CRON   (default every 3 h)  weather-only pass: forecast / alerts / water / pest risk
 *   MONITOR_SATELLITE_CRON (default every 6 h)  look for a NEW clear Sentinel-2 (or Sentinel-1) scene
 *                                               per field; only those fields get a full satellite run
 *   + event triggers: after each advisory, when a farmer completes an operation,
 *     and POST /advisory/internal/monitor (webhook from the satellite server).
 *
 * Enabled with CONDITION_MONITOR_ENABLED=true.
 */
const ENABLED = String(process.env.CONDITION_MONITOR_ENABLED || "false").toLowerCase() === "true";
const WEATHER_CRON = process.env.MONITOR_WEATHER_CRON || "15 */3 * * *";
const SATELLITE_CRON = process.env.MONITOR_SATELLITE_CRON || "45 */6 * * *";
const MAX_CLOUD = Number(process.env.NDVI_MAX_CLOUD_PCT) || 40;
const SPREAD_MS = Number(process.env.MONITOR_SPREAD_MS) || 60 * 60 * 1000; // spread jobs over 1 h

let weatherRunning = false;
let satelliteRunning = false;

/** Fields with an active subscription (same rule as the advisory cron; AAT Starter excluded). */
export async function getSubscribedFieldIds() {
  const subscriptions = await UserSubscription.find({
    status: "active",
    $or: [{ endDate: null }, { endDate: { $gte: new Date() } }],
  })
    .select("fieldId planId")
    .populate("planId", "brand features");
  const ids = new Set();
  for (const s of subscriptions) {
    if (!s.fieldId) continue;
    const plan = s.planId;
    if (plan?.brand === "aat" && !plan.features?.smartAdvisorySystem) continue;
    ids.add(String(s.fieldId));
  }
  return [...ids];
}

function spreadDelay(index, total) {
  return total > 1 ? Math.floor((index / total) * SPREAD_MS) : 0;
}

async function weatherPass() {
  if (weatherRunning) return;
  weatherRunning = true;
  try {
    const fieldIds = await getSubscribedFieldIds();
    const crops = await FieldCrop.find({ farmField: { $in: fieldIds }, isActive: true }).select("_id farmField").lean();
    console.log(`[Monitor] weather pass: ${crops.length} crop(s)`);
    for (let i = 0; i < crops.length; i++) {
      await enqueueConditionCheck({
        farmFieldId: crops[i].farmField,
        cropInstanceId: crops[i]._id,
        trigger: "weather",
        delayMs: spreadDelay(i, crops.length),
      });
    }
  } catch (err) {
    console.error("[Monitor] weather pass failed:", err?.message || err);
  } finally {
    weatherRunning = false;
  }
}

/** True when a clear Sentinel-2 scene newer than the last processed one exists. */
async function hasNewScene(farmField, lastSceneDate) {
  const geometry = resolveAdvisoryApiGeometry(farmField).geometry;
  if (!geometry) return false;
  const end = formatDateISO(new Date());
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 12);
  const start = lastSceneDate && lastSceneDate > formatDateISO(startDate) ? lastSceneDate : formatDateISO(startDate);
  const availability = await getImageAvailability(geometry, start, end, "both", "s2");
  const items = Array.isArray(availability?.items) ? availability.items : [];
  return items.some((it) => {
    const date = String(it?.date || "").slice(0, 10);
    const cloud = Number(it?.cloud_cover);
    return date && (!lastSceneDate || date > lastSceneDate) && (!Number.isFinite(cloud) || cloud <= MAX_CLOUD);
  });
}

async function satellitePass() {
  if (satelliteRunning) return;
  satelliteRunning = true;
  try {
    const fieldIds = await getSubscribedFieldIds();
    const farms = await FarmField.find({ _id: { $in: fieldIds } }).lean();
    let queued = 0;
    for (const farm of farms) {
      try {
        const last = await FieldConditionSnapshot.findOne({ farmFieldId: farm._id })
          .sort({ createdAt: -1 })
          .select("lastS2SceneDate createdAt")
          .lean();
        const staleDays = last ? (Date.now() - new Date(last.createdAt).getTime()) / 86400000 : Infinity;
        // New clear scene → full run; also force a full run at least weekly.
        if (staleDays >= 7 || (await hasNewScene(farm, last?.lastS2SceneDate))) {
          await enqueueConditionCheck({ farmFieldId: farm._id, trigger: "satellite", delayMs: spreadDelay(queued, farms.length) });
          queued++;
        }
      } catch (err) {
        console.warn(`[Monitor] scene check failed for ${farm._id}:`, err?.message || err);
      }
    }
    console.log(`[Monitor] satellite pass: ${queued}/${farms.length} field(s) with new imagery`);
  } catch (err) {
    console.error("[Monitor] satellite pass failed:", err?.message || err);
  } finally {
    satelliteRunning = false;
  }
}

/** Call once at server start (next to runAdvisoryJob()). */
export function startConditionMonitorJobs() {
  if (!ENABLED) {
    console.log("[Monitor] disabled (set CONDITION_MONITOR_ENABLED=true)");
    return;
  }
  startConditionMonitorQueueWorker();
  cron.schedule(WEATHER_CRON, weatherPass);
  cron.schedule(SATELLITE_CRON, satellitePass);
  console.log(`[Monitor] scheduled: weather "${WEATHER_CRON}", satellite "${SATELLITE_CRON}"`);
}

export { weatherPass, satellitePass };
