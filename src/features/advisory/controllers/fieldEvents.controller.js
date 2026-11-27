import mongoose from "mongoose";
import FarmField from "../../../models/field.model.js";
import User from "../../../models/user.model.js";
import { sameOrg } from "../../../utils/auth/orgScope.js";
import FieldEvent from "../models/fieldEvent.model.js";
import FieldConditionSnapshot from "../models/fieldConditionSnapshot.model.js";
import { runConditionMonitorForCrop, runConditionMonitorForField } from "../services/conditionMonitor.service.js";
import { enqueueConditionCheck } from "../queue/conditionMonitor.queue.js";

const SEVERITY_ORDER = { High: 0, Medium: 1, Low: 2, Info: 3 };

/** Answers the farmer can give on a popup ("was this right?"), per event type. */
const FEEDBACK_OPTIONS = {
  CANOPY_LOSS_SAR: ["lodging", "damage", "harvested", "no_change"],
  WATERLOG_SAR: ["water_standing", "no_water"],
  PEST_RISK: ["seen_in_field", "not_seen"],
  VEG_DROP: ["found_problem", "crop_fine"],
  VEG_BELOW_EXPECTED: ["found_problem", "crop_fine"],
  WATER_STRESS: ["crop_dry", "crop_fine"],
  N_STRESS: ["yellowing_seen", "crop_fine"],
  TASK_OVERDUE: ["done", "not_needed"],
};

/** Shape the app renders as a popup card. */
export function toPopup(e) {
  return {
    id: String(e._id),
    farmFieldId: String(e.farmFieldId),
    cropInstanceId: e.cropInstanceId ? String(e.cropInstanceId) : null,
    type: e.type,
    severity: e.severity,
    confidence: e.confidence,
    status: e.status,
    title: e.title,
    message: e.message,
    causes: e.causesText || [],
    evidence: e.evidence || [],
    firstSeenAt: e.firstSeenAt,
    lastSeenAt: e.lastSeenAt,
    actions: ["seen", "feedback"],
    feedbackOptions: FEEDBACK_OPTIONS[e.type] || ["correct", "not_correct"],
    feedback: e.feedback || null,
  };
}

async function loadAuthorizedField(req, res, farmFieldId) {
  if (!mongoose.Types.ObjectId.isValid(farmFieldId)) {
    res.status(400).json({ success: false, message: "Invalid farmFieldId." });
    return null;
  }
  const field = await FarmField.findById(farmFieldId).populate("user", "organization").lean();
  if (!field) {
    res.status(404).json({ success: false, message: "Farm field not found." });
    return null;
  }
  let ownerOrg = field.user?.organization?._id || field.user?.organization || null;
  if (!ownerOrg && field.user) {
    const owner = await User.findById(field.user._id || field.user).select("organization").lean();
    ownerOrg = owner?.organization || null;
  }
  if (req.user && !sameOrg(req.user, ownerOrg)) {
    res.status(403).json({ success: false, message: "You can only view fields in your organization." });
    return null;
  }
  return field;
}

/** GET /advisory/events/:farmFieldId?status=open|all&cropInstanceId=&limit= */
export const getFieldEvents = async (req, res) => {
  try {
    const field = await loadAuthorizedField(req, res, req.params.farmFieldId);
    if (!field) return;
    const { status = "open", cropInstanceId, limit = 50 } = req.query;
    const query = { farmFieldId: field._id };
    if (status === "open") query.status = { $in: ["open", "acknowledged"] };
    else if (status !== "all") query.status = status;
    if (cropInstanceId && mongoose.Types.ObjectId.isValid(cropInstanceId)) query.cropInstanceId = cropInstanceId;
    const events = await FieldEvent.find(query).sort({ lastSeenAt: -1 }).limit(Math.min(Number(limit) || 50, 200)).lean();
    events.sort((a, b) => (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9));
    return res.json({ success: true, count: events.length, events: events.map(toPopup) });
  } catch (err) {
    console.error("getFieldEvents:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/** GET /advisory/events/user/me?status=open  - popup feed across all of the farmer's fields */
export const getMyEvents = async (req, res) => {
  try {
    const userId = req.user?._id || req.user?.id;
    if (!userId) return res.status(401).json({ success: false, message: "Not authenticated." });
    const query = { user: userId };
    if ((req.query.status || "open") === "open") query.status = "open";
    const events = await FieldEvent.find(query).sort({ lastSeenAt: -1 }).limit(100).lean();
    events.sort((a, b) => (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9));
    return res.json({ success: true, count: events.length, events: events.map(toPopup) });
  } catch (err) {
    console.error("getMyEvents:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/** PATCH /advisory/events/item/:eventId  { action: "seen" | "resolve" | "feedback", answer?, note? } */
export const updateFieldEvent = async (req, res) => {
  try {
    const { eventId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(eventId)) return res.status(400).json({ success: false, message: "Invalid eventId." });
    const event = await FieldEvent.findById(eventId);
    if (!event) return res.status(404).json({ success: false, message: "Event not found." });
    const field = await loadAuthorizedField(req, res, String(event.farmFieldId));
    if (!field) return;

    const { action, answer, note } = req.body || {};
    const now = new Date();
    if (action === "seen") {
      if (event.status === "open") {
        event.status = "acknowledged";
        event.acknowledgedAt = now;
      }
    } else if (action === "resolve") {
      event.status = "resolved";
      event.resolvedAt = now;
      event.resolvedReason = req.user?.role && /admin|agronom/i.test(String(req.user.role)) ? "agronomist" : "farmer";
    } else if (action === "feedback") {
      const options = FEEDBACK_OPTIONS[event.type] || ["correct", "not_correct"];
      if (!options.includes(answer)) {
        return res.status(400).json({ success: false, message: `answer must be one of: ${options.join(", ")}` });
      }
      event.feedback = { answer, note: note ? String(note).slice(0, 500) : null, by: req.user?._id || null, at: now };
      if (event.status === "open") {
        event.status = "acknowledged";
        event.acknowledgedAt = now;
      }
      // Harvest reported → re-check so the crop lifecycle can update.
      if (answer === "harvested") {
        await enqueueConditionCheck({ farmFieldId: event.farmFieldId, cropInstanceId: event.cropInstanceId, trigger: "operation" });
      }
    } else {
      return res.status(400).json({ success: false, message: "action must be seen, resolve or feedback" });
    }
    await event.save();
    return res.json({ success: true, event: toPopup(event.toObject()) });
  } catch (err) {
    console.error("updateFieldEvent:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/** GET /advisory/condition/:farmFieldId?cropInstanceId=&days=60  - latest snapshot + trend for charts */
export const getFieldCondition = async (req, res) => {
  try {
    const field = await loadAuthorizedField(req, res, req.params.farmFieldId);
    if (!field) return;
    const days = Math.min(Number(req.query.days) || 60, 365);
    const since = new Date(Date.now() - days * 86400000);
    const query = { farmFieldId: field._id, createdAt: { $gte: since } };
    if (req.query.cropInstanceId && mongoose.Types.ObjectId.isValid(req.query.cropInstanceId)) {
      query.cropInstanceId = req.query.cropInstanceId;
    }
    const snaps = await FieldConditionSnapshot.find(query).sort({ createdAt: 1 }).select("-satelliteSeries").lean();
    const latest = snaps[snaps.length - 1] || null;
    const byDate = new Map();
    for (const s of snaps) {
      const x = s.snapshot || {};
      byDate.set(s.date, {
        date: s.date,
        bbch: x.bbch,
        stage: x.stageName,
        ndvi: x.s2?.NDVI?.value ?? null,
        ndre: x.s2?.NDRE?.value ?? null,
        ndmi: x.s2?.NDMI?.value ?? null,
        expectedNdvi: x.expected?.NDVI?.value ?? null,
        vv: x.s1?.vv ?? null,
        vh: x.s1?.vh ?? null,
        depletionMm: x.water?.depletionMm ?? null,
        topPest: x.pest?.top || null,
      });
    }
    return res.json({ success: true, latest: latest ? { date: latest.date, snapshot: latest.snapshot } : null, trend: [...byDate.values()] });
  } catch (err) {
    console.error("getFieldCondition:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * POST /advisory/internal/monitor  (x-api-key)
 * { farmFieldId, cropInstanceId?, trigger?: "satellite"|"manual"|…, wait?: boolean }
 * Call it from the satellite server as soon as a new scene is ingested for a field.
 */
export const triggerConditionMonitor = async (req, res) => {
  try {
    const { farmFieldId, cropInstanceId = null, trigger = "manual", wait = false } = req.body || {};
    if (!farmFieldId || !mongoose.Types.ObjectId.isValid(farmFieldId)) {
      return res.status(400).json({ success: false, message: "valid farmFieldId required" });
    }
    if (wait) {
      const result = cropInstanceId
        ? await runConditionMonitorForCrop({ farmFieldId, cropInstanceId, trigger })
        : await runConditionMonitorForField({ farmFieldId, trigger });
      return res.json({ success: true, result });
    }
    const queued = await enqueueConditionCheck({ farmFieldId, cropInstanceId, trigger });
    return res.status(202).json({ success: true, ...queued });
  } catch (err) {
    console.error("triggerConditionMonitor:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
};
