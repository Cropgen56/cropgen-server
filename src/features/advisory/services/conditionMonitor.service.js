import FarmField from "../../../models/field.model.js";
import FieldCrop from "../../../models/field-crop.model.js";
import User from "../../../models/user.model.js";
import { createNotification } from "../../../services/notificationCreator.service.js";
import { resolveAOIForFarm } from "../../../utils/weather/weather.utils.js";
import { resolveAdvisoryApiGeometry } from "../../../utils/geometry/farmGeometry.js";
import { resolveIrrigationFamily } from "../../../constants/farmEnums.js";
import FarmAdvisory from "../models/farmAdvisory.model.js";
import FieldConditionSnapshot from "../models/fieldConditionSnapshot.model.js";
import FieldEvent from "../models/fieldEvent.model.js";
import {
  getCurrentWeather,
  getForecastWeather,
  getHistoricalWeatherWithFallback,
} from "../client/observearth.client.js";
import { getMonitorOpticalSeries, getSarTimeseries } from "../client/satellite.client.js";
import { parseNDVIMetrics } from "../utils/satellite/index.js";
import { assembleWeatherSummary } from "../utils/weather/weatherSnapshot.utils.js";
import { resolveHybridCropStage } from "../cropGrowthStage/index.js";
import { getPrimaryActiveCrop, syntheticCropFromLegacyField } from "../utils/shared/cropInstances.js";
import { localizeGrowStageName } from "../utils/i18n/advisoryLocale.js";
import { buildActivityAdvisoryParameters } from "../utils/notifications/advisoryNotificationParams.js";
import { formatDateISO } from "../utils/shared/helpers.js";
import { loadFarmHistory } from "./farmHistory.service.js";
import { loadRules, runRulesEngine } from "../rules-engine/index.js";
import { buildDailySeries } from "../rules-engine/features/weather.js";
import { runConditionMonitor } from "../rules-engine/monitor/index.js";

/**
 * MONITOR_NOTIFY
 *   off    - detect + store events (API/popup feed still works), send nothing
 *   popup  - push notifications only
 *   all    - push + WhatsApp (default)
 */
const NOTIFY_MODE = String(process.env.MONITOR_NOTIFY || "all").toLowerCase();
const WA_MODE = String(process.env.WHATSAPP_TEMPLATE_MODE || "legacy").toLowerCase();
const TEMPLATE_ALERT = process.env.WA_TEMPLATE_ALERT || "cg_alert";
const PUSH_TEMPLATE = process.env.MONITOR_PUSH_TEMPLATE || "field_event";
const SATELLITE_LOOKBACK_DAYS = Number(process.env.MONITOR_SATELLITE_LOOKBACK_DAYS) || 45;
const WEATHER_ONLY_TRIGGERS = new Set(["weather"]);

function isoAddDays(iso, days) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function startOfTodayUTC(now) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

async function resolveCrop(farmField, cropInstanceId) {
  if (cropInstanceId) {
    return FieldCrop.findOne({ _id: cropInstanceId, farmField: farmField._id, isActive: true }).lean();
  }
  if (farmField.isBarrenLand) return null;
  const primary = await getPrimaryActiveCrop(farmField._id);
  if (primary) return primary.toObject ? primary.toObject() : primary;
  return farmField.cropName ? syntheticCropFromLegacyField(farmField) : null;
}

async function fetchSatellite({ geometry, todayISO, previousDoc, trigger, log }) {
  if (WEATHER_ONLY_TRIGGERS.has(trigger) && previousDoc?.satelliteSeries) {
    return { series: previousDoc.satelliteSeries, refreshed: false, errors: [] };
  }
  const start = isoAddDays(todayISO, -SATELLITE_LOOKBACK_DAYS);
  const [optical, s1] = await Promise.allSettled([
    getMonitorOpticalSeries(geometry, start, todayISO, parseNDVIMetrics),
    getSarTimeseries(geometry, start, todayISO),
  ]);
  const errors = [];
  const series = { s2: {}, s1: [] };
  if (optical.status === "fulfilled") {
    series.s2 = optical.value.series;
    errors.push(...optical.value.errors);
  } else {
    errors.push(`optical: ${optical.reason?.message || optical.reason}`);
  }
  if (s1.status === "fulfilled") series.s1 = s1.value;
  else errors.push(`s1: ${s1.reason?.message || s1.reason}`);
  if (errors.length) log(`satellite: ${errors.join("; ")}`);
  // Keep the previous series for anything that failed this time.
  if (previousDoc?.satelliteSeries) {
    for (const [k, v] of Object.entries(previousDoc.satelliteSeries.s2 || {})) {
      if (!series.s2[k]?.length && v?.length) series.s2[k] = v;
    }
    if (!series.s1.length && previousDoc.satelliteSeries.s1?.length) series.s1 = previousDoc.satelliteSeries.s1;
  }
  return { series, refreshed: true, errors };
}

/** Growth stage: full hybrid model on full runs, carried forward on weather-only runs. */
async function resolveStage({ farmFieldId, cropInstanceId, crop, sowingDateISO, todayISO, historicalWeather, weatherSummary, ndviSeries, previousSnap, trigger }) {
  if (WEATHER_ONLY_TRIGGERS.has(trigger) && previousSnap) {
    return {
      bbch: previousSnap.bbch,
      stageName: previousSnap.stageName,
      stageConfidence: previousSnap.stageConfidence,
      cumulativeGDD: previousSnap.cumulativeGDD,
      gddBbch: previousSnap.gddBbch,
      ndviBbch: previousSnap.ndviBbch,
      ndviConfidence: previousSnap.ndviConfidence,
    };
  }
  try {
    const hybrid = resolveHybridCropStage({
      cropName: crop.cropName,
      sowingDateISO,
      endDateISO: todayISO,
      historicalWeather,
      weatherSummary,
      ndvi: { series: ndviSeries || [] },
    });
    return {
      bbch: hybrid.plantGrowthActivity.bbchStage,
      stageName: hybrid.plantGrowthActivity.stageName,
      stageConfidence: hybrid.plantGrowthActivity.stageConfidence,
      cumulativeGDD: hybrid.cumulativeGDD,
      gddBbch: hybrid.gddStage?.bbchStage ?? null,
      ndviBbch: hybrid.ndviStage?.bbchStage ?? null,
      ndviConfidence: hybrid.phenology?.confidence ?? null,
    };
  } catch {
    // Fall back to the latest advisory's stage.
    const latest = await FarmAdvisory.findOne({ farmFieldId, ...(cropInstanceId ? { cropInstanceId } : {}) })
      .sort({ createdAt: -1 })
      .select("plantGrowthActivity")
      .lean();
    const pga = latest?.plantGrowthActivity || {};
    return { bbch: pga.bbchStage ?? 0, stageName: pga.stageName, stageConfidence: pga.stageConfidence, cumulativeGDD: pga.cumulativeGDD };
  }
}

async function persistEvents({ out, farmField, cropInstanceId, user, language, snapshotId, now }) {
  const saved = [];
  for (const e of out.events) {
    const doc = {
      farmFieldId: farmField._id,
      cropInstanceId: cropInstanceId || null,
      user: farmField.user?._id || farmField.user || null,
      key: e.key,
      type: e.type,
      severity: e.severity,
      confidence: e.confidence,
      status: e.status,
      language,
      title: e.title,
      message: e.message,
      causes: e.causes || [],
      causesText: e.causesText || [],
      vars: e.vars || {},
      evidence: e.evidence || [],
      firstSeenAt: e.firstSeenAt,
      lastSeenAt: e.lastSeenAt,
      expiresAt: e.expiresAt,
      whatsappPending: Boolean(e.whatsappPending),
      snapshotId,
      rulesVersion: out.rulesVersion,
    };
    if (e.notify.popup) {
      doc.lastNotifiedAt = now;
      doc.notifiedSeverity = e.severity;
    }
    const event = e.eventId
      ? await FieldEvent.findByIdAndUpdate(e.eventId, { $set: doc }, { new: true })
      : await FieldEvent.create(doc);
    if (event) saved.push({ event, decision: e });
  }
  if (out.resolved.length) {
    await FieldEvent.updateMany(
      { _id: { $in: out.resolved.map((r) => r.eventId).filter(Boolean) } },
      { $set: { status: "resolved", resolvedAt: now, resolvedReason: "condition_cleared" } },
    );
    // Distinguish expired ones (same update is fine for both, reason refined here).
    const expiredIds = out.resolved.filter((r) => r.reason === "expired").map((r) => r.eventId).filter(Boolean);
    if (expiredIds.length) await FieldEvent.updateMany({ _id: { $in: expiredIds } }, { $set: { resolvedReason: "expired" } });
  }
  return saved;
}

async function sendNotifications({ saved, user, farmField, now, log }) {
  if (NOTIFY_MODE === "off" || !user) return { push: 0, whatsapp: 0 };
  let push = 0;
  let whatsapp = 0;
  for (const { event, decision } of saved) {
    if (decision.notify.popup) {
      try {
        await createNotification({
          user,
          type: "FIELD_EVENT",
          referenceId: event._id,
          templateName: PUSH_TEMPLATE,
          parameters: {
            eventId: String(event._id),
            farmFieldId: String(farmField._id),
            type: event.type,
            severity: event.severity,
            title: event.title,
            message: event.message,
          },
        });
        push++;
      } catch (err) {
        log(`push failed for ${event.type}: ${err?.message || err}`);
      }
    }
    if (NOTIFY_MODE === "all" && decision.notify.whatsapp && user.phone) {
      try {
        if (WA_MODE === "v2") {
          await createNotification({ user, type: "ADVISORY", referenceId: event._id, templateName: TEMPLATE_ALERT, parameters: decision.whatsappParams });
        } else {
          await createNotification({
            user,
            type: "ADVISORY",
            referenceId: event._id,
            templateName: "advisory",
            parameters: buildActivityAdvisoryParameters(user, farmField, {
              type: "WEATHER",
              title: decision.whatsappParams[1],
              message: decision.whatsappParams[2],
              details: {},
            }),
          });
        }
        await FieldEvent.updateOne({ _id: event._id }, { $set: { whatsappSentAt: now, whatsappPending: false } });
        whatsapp++;
      } catch (err) {
        log(`whatsapp failed for ${event.type}: ${err?.message || err}`);
      }
    }
  }
  return { push, whatsapp };
}

/**
 * Run the condition monitor for one crop on one field.
 * @param {object} p
 * @param {string} p.farmFieldId
 * @param {string|null} [p.cropInstanceId]
 * @param {"daily"|"weather"|"satellite"|"operation"|"advisory"|"manual"} [p.trigger]
 * @param {boolean} [p.notify]
 * @returns {Promise<object>} summary
 */
export async function runConditionMonitorForCrop({ farmFieldId, cropInstanceId = null, trigger = "daily", notify = true }) {
  const started = Date.now();
  const tag = `[Monitor] ${farmFieldId}${cropInstanceId ? `/${cropInstanceId}` : ""} (${trigger})`;
  const log = (m) => console.log(`${tag} ${m}`);
  const now = new Date();
  const todayISO = formatDateISO(now);

  const farmField = await FarmField.findById(farmFieldId).lean();
  if (!farmField) throw new Error(`FarmField not found: ${farmFieldId}`);
  const cropDoc = await resolveCrop(farmField, cropInstanceId);
  if (!cropDoc) return { skipped: "no_active_crop" };
  const cropId = cropDoc._id || null;

  const user = farmField.user
    ? await User.findById(farmField.user).populate("organization", "organizationCode").lean()
    : null;
  const language = user?.language || "en";

  const rules = loadRules();
  const crop = rules.findCrop(cropDoc.cropName);
  if (!crop) return { skipped: "crop_not_in_rulebook", cropName: cropDoc.cropName };

  const { aoiId } = await resolveAOIForFarm(farmField);
  const sowingDateISO = formatDateISO(cropDoc.startDate || farmField.sowingDate || now);
  const weatherOnly = WEATHER_ONLY_TRIGGERS.has(trigger);

  const [previousDoc, openEvents, sentToday] = await Promise.all([
    FieldConditionSnapshot.findOne({ farmFieldId: farmField._id, cropInstanceId: cropId }).sort({ createdAt: -1 }).lean(),
    FieldEvent.find({ farmFieldId: farmField._id, cropInstanceId: cropId, status: { $in: ["open", "acknowledged"] } }).lean(),
    FieldEvent.countDocuments({ farmFieldId: farmField._id, whatsappSentAt: { $gte: startOfTodayUTC(now) } }),
  ]);

  const [current, forecast, historical] = await Promise.all([
    getCurrentWeather(aoiId).catch(() => null),
    getForecastWeather(aoiId).catch(() => null),
    getHistoricalWeatherWithFallback(aoiId, sowingDateISO, todayISO, { preferShortWindows: weatherOnly }),
  ]);
  if (!current && !forecast) throw new Error("weather unavailable");
  const weatherSummary = assembleWeatherSummary(current, forecast);

  const geometry = resolveAdvisoryApiGeometry(farmField).geometry;
  const sat = geometry
    ? await fetchSatellite({ geometry, todayISO, previousDoc, trigger, log })
    : { series: { s2: {}, s1: [] }, refreshed: false, errors: ["no geometry"] };

  const stage = await resolveStage({
    farmFieldId: farmField._id,
    cropInstanceId: cropId,
    crop: cropDoc,
    sowingDateISO,
    todayISO,
    historicalWeather: historical?.data,
    weatherSummary,
    ndviSeries: sat.series.s2?.NDVI,
    previousSnap: previousDoc?.snapshot,
    trigger,
  });

  const history = await loadFarmHistory({ farmFieldId: farmField._id, cropInstanceId: cropId, rules, log });
  const regionProfile = farmField.regionProfile || {};
  const engine = runRulesEngine({
    rules,
    now,
    language,
    farm: {
      cropName: cropDoc.cropName,
      fieldName: farmField.fieldName,
      acre: farmField.acre,
      typeOfFarming: farmField.typeOfFarming,
      typeOfIrrigation: farmField.typeOfIrrigation,
      irrigationFamily: resolveIrrigationFamily(farmField.typeOfIrrigation),
      soilType: regionProfile.soilType || regionProfile.soilTexture || farmField.soilType,
      country: farmField.country,
      state: farmField.state || regionProfile.state || regionProfile.stateCode,
      waterSource: farmField.waterSource,
      irrigationDetails: farmField.irrigationDetails,
    },
    crop: { bbchStage: stage.bbch, stageName: stage.stageName, sowingDate: sowingDateISO },
    weather: { weatherSummary, historical: historical?.data },
    // Monitor manages its own alert lifecycle → give the engine an empty alert history.
    history: { ...history, alertsSent: [] },
    user: { firstName: user?.firstName, country: user?.country },
  });

  const series = buildDailySeries({ historical: historical?.data, weatherSummary, todayISO });
  const out = runConditionMonitor({
    rules,
    now,
    language,
    crop,
    bbch: stage.bbch,
    stageName: localizeGrowStageName(stage.stageName, language) || stage.stageName,
    stageConfidence: stage.stageConfidence,
    cumulativeGDD: stage.cumulativeGDD,
    gddBbch: stage.gddBbch,
    ndviBbch: stage.ndviBbch,
    ndviConfidence: stage.ndviConfidence,
    s2: sat.series.s2,
    s1: sat.series.s1,
    series,
    engine,
    history,
    previous: previousDoc?.snapshot || null,
    openEvents: openEvents.map((e) => ({ ...e, eventId: e._id })),
    whatsappSentToday: sentToday,
    fieldName: farmField.fieldName,
  });

  const snapshotDoc = await FieldConditionSnapshot.create({
    farmFieldId: farmField._id,
    cropInstanceId: cropId,
    trigger,
    date: todayISO,
    monitorVersion: out.monitorVersion,
    rulesVersion: out.rulesVersion,
    snapshot: out.snapshot,
    satelliteSeries: sat.series,
    lastS2SceneDate: out.snapshot.s2?.lastClearDate || previousDoc?.lastS2SceneDate || null,
    lastS1SceneDate: out.snapshot.s1?.date || previousDoc?.lastS1SceneDate || null,
    evaluated: out.evaluated,
    eventKeys: out.events.map((e) => e.key),
  });

  const saved = await persistEvents({ out, farmField, cropInstanceId: cropId, user, language, snapshotId: snapshotDoc._id, now });
  const allowed = notify && user;
  const sent = allowed ? await sendNotifications({ saved, user, farmField, now, log }) : { push: 0, whatsapp: 0 };

  const summary = {
    farmFieldId: String(farmField._id),
    cropInstanceId: cropId ? String(cropId) : null,
    trigger,
    events: out.events.map((e) => ({ type: e.type, severity: e.severity, isNew: e.isNew })),
    resolved: out.resolved.length,
    sent,
    satelliteRefreshed: sat.refreshed,
    ms: Date.now() - started,
  };
  log(`events=${summary.events.length} resolved=${summary.resolved} push=${sent.push} wa=${sent.whatsapp} in ${summary.ms}ms`);
  return summary;
}

/** All active crops on a field (multi-crop aware). */
export async function runConditionMonitorForField({ farmFieldId, trigger = "daily", notify = true }) {
  const crops = await FieldCrop.find({ farmField: farmFieldId, isActive: true }).select("_id").lean();
  if (!crops.length) return [await runConditionMonitorForCrop({ farmFieldId, trigger, notify })];
  const results = [];
  for (const c of crops) {
    try {
      results.push(await runConditionMonitorForCrop({ farmFieldId, cropInstanceId: c._id, trigger, notify }));
    } catch (err) {
      results.push({ farmFieldId: String(farmFieldId), cropInstanceId: String(c._id), error: err?.message || String(err) });
    }
  }
  return results;
}
