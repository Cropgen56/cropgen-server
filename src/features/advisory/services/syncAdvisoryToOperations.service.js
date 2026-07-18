import Operation from "../../../models/operation.model.js";

/** Maps Smart Advisory activity types to farm operation types */
const ACTIVITY_TO_OPERATION_TYPE = {
  SPRAY: "spray",
  FERTIGATION: "fertilizer_application",
  IRRIGATION: "other",
  WEATHER: "other",
  CROP_RISK: "other",
  MONITORING: "interculture_operation",
  CARBON_TRACKING: "other",
};

/**
 * Spread advisory tasks across upcoming calendar days so farmers see them
 * on the month grid (not piled onto a single “today” cell).
 */
const ACTIVITY_DAY_OFFSET = {
  SPRAY: 0,
  FERTIGATION: 1,
  IRRIGATION: 0,
  WEATHER: 0,
  CROP_RISK: 2,
  MONITORING: 3,
  CARBON_TRACKING: 5,
};

function padTime(hour) {
  const h = Math.min(Math.max(hour, 0), 23);
  return `${String(h).padStart(2, "0")}:00:00`;
}

/** Local calendar date YYYY-MM-DD (avoids UTC day-shift). */
export function getTodayDateISO(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function addDaysLocalISO(baseDate, days) {
  const d = new Date(baseDate);
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return getTodayDateISO(d);
}

function resolveActivityOperationDate(activity, index, baseDate = new Date()) {
  const fromDetails =
    activity?.details?.scheduledDate ||
    activity?.details?.dueDate ||
    activity?.scheduledDate ||
    activity?.dueDate;
  if (fromDetails) {
    const raw = String(fromDetails).slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  }

  const offset =
    ACTIVITY_DAY_OFFSET[activity?.type] != null
      ? ACTIVITY_DAY_OFFSET[activity.type]
      : Math.min(index, 6);
  return addDaysLocalISO(baseDate, offset);
}

function extractChemicalFields(activity) {
  const details = activity?.details || {};
  let chemicalUsed = "";
  let chemicalQuantity = "";

  if (activity.type === "FERTIGATION") {
    chemicalUsed =
      details.fertilizer ||
      (Array.isArray(details.products)
        ? details.products.map((p) => p.name || p.productName).filter(Boolean).join(" + ")
        : "") ||
      "";
    chemicalQuantity =
      details.quantity ||
      (Array.isArray(details.products)
        ? details.products
            .map((p) => {
              if (p.quantityKgPerAcre != null) return `${p.quantityKgPerAcre} kg/acre`;
              if (p.dose) return p.dose;
              return null;
            })
            .filter(Boolean)
            .join("; ")
        : "") ||
      "";
  } else if (activity.type === "SPRAY") {
    if (Array.isArray(details.products) && details.products.length) {
      chemicalUsed = details.products
        .map((p) => `${p.name || ""}${p.dose ? ` (${p.dose})` : ""}`.trim())
        .filter(Boolean)
        .join("; ");
    } else if (details.chemical) {
      chemicalUsed = details.chemical;
    }
    chemicalQuantity = details.applicationMethod || details.timing || "";
  } else if (activity.type === "IRRIGATION") {
    chemicalUsed = details.applicationMethod || "Irrigation";
    chemicalQuantity =
      details.duration || details.waterQuantity || details.timing || "";
  }

  if (!chemicalUsed && activity.type === "FERTIGATION" && activity.message) {
    const match = activity.message.match(/apply\s+([^:.]+)[:\s]+([^.]+)/i);
    if (match) {
      chemicalUsed = match[1].trim();
      chemicalQuantity = match[2].trim();
    }
  }

  return {
    chemicalUsed: chemicalUsed.trim() || undefined,
    chemicalQuantity: chemicalQuantity.trim() || undefined,
  };
}

export function buildOperationFromActivity(activity, index, { farmFieldId, advisoryId, operationDate }) {
  const { chemicalUsed, chemicalQuantity } = extractChemicalFields(activity);
  const operationType =
    ACTIVITY_TO_OPERATION_TYPE[activity.type] || "other";

  const comments = [
    `[Smart Advisory] ${activity.title || activity.type}`,
    activity.message || "",
  ]
    .filter(Boolean)
    .join("\n\n");

  return {
    farmField: farmFieldId,
    source: "advisory",
    advisoryId,
    advisoryActivityType: activity.type,
    operationType,
    supervisorName: "Smart Advisory",
    progress: activity.progress ?? undefined,
    chemicalUsed,
    chemicalQuantity,
    comments,
    operationDate,
    operationTime: padTime(8 + (index % 8)),
  };
}

/**
 * Persist advisory "Activities To Do" as calendar operations for the farm field.
 * Replaces prior non-completed advisory-sourced operations for the same field.
 */
export async function syncAdvisoryActivitiesToOperations({
  farmFieldId,
  advisoryId,
  activitiesToDo = [],
  generatedAt = new Date(),
}) {
  if (!farmFieldId || !advisoryId) {
    return { created: 0, deleted: 0, operationIds: [] };
  }

  const baseDate = generatedAt instanceof Date ? generatedAt : new Date(generatedAt);
  const activities = Array.isArray(activitiesToDo) ? activitiesToDo : [];

  const deleteResult = await Operation.deleteMany({
    farmField: farmFieldId,
    source: "advisory",
    progress: { $ne: "completed" },
  });

  if (!activities.length) {
    return {
      created: 0,
      deleted: deleteResult.deletedCount ?? 0,
      operationIds: [],
    };
  }

  const docs = activities.map((activity, index) =>
    buildOperationFromActivity(activity, index, {
      farmFieldId,
      advisoryId,
      operationDate: resolveActivityOperationDate(activity, index, baseDate),
    }),
  );

  const inserted = await Operation.insertMany(docs);

  return {
    created: inserted.length,
    deleted: deleteResult.deletedCount ?? 0,
    operationIds: inserted.map((op) => op._id),
  };
}

/**
 * Create or update a single advisory activity on the Operations calendar.
 */
export async function upsertAdvisoryActivityOperation({
  farmFieldId,
  advisoryId,
  activity,
  index = 0,
  operationDate,
}) {
  if (!farmFieldId || !advisoryId || !activity?.type) {
    return null;
  }

  const resolvedDate =
    operationDate || resolveActivityOperationDate(activity, index, new Date());

  const payload = buildOperationFromActivity(activity, index, {
    farmFieldId,
    advisoryId,
    operationDate: resolvedDate,
  });

  return Operation.findOneAndUpdate(
    {
      farmField: farmFieldId,
      advisoryId,
      advisoryActivityType: activity.type,
    },
    { $set: payload },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
}

/**
 * Ensure each activity on the latest advisory has a calendar operation.
 * Spreads incomplete tasks onto their scheduled day offsets (not all on today).
 */
export async function ensureAdvisoryOperationsSynced({
  farmFieldId,
  advisoryId,
  activitiesToDo = [],
}) {
  if (!farmFieldId || !advisoryId) {
    return { created: 0, updated: 0 };
  }

  const activities = Array.isArray(activitiesToDo) ? activitiesToDo : [];
  const baseDate = new Date();
  const validActivities = activities.filter((a) => a?.type);
  if (!validActivities.length) {
    return { created: 0, updated: 0 };
  }

  const existingOps = await Operation.find({
    farmField: farmFieldId,
    advisoryId,
    advisoryActivityType: { $in: validActivities.map((a) => a.type) },
  })
    .select("_id advisoryActivityType progress operationDate")
    .lean();

  const existingByType = new Map(
    existingOps.map((entry) => [entry.advisoryActivityType, entry]),
  );

  let created = 0;
  let updated = 0;
  const bulkOps = [];

  for (let i = 0; i < validActivities.length; i++) {
    const activity = validActivities[i];
    const existing = existingByType.get(activity.type);
    const targetDate = resolveActivityOperationDate(activity, i, baseDate);

    if (!existing) {
      const doc = buildOperationFromActivity(activity, i, {
        farmFieldId,
        advisoryId,
        operationDate: targetDate,
      });
      bulkOps.push({ insertOne: { document: doc } });
      created++;
      continue;
    }

    const progress = activity.progress ?? null;
    const updates = {};
    if (progress != null && existing.progress !== progress) {
      updates.progress = progress;
    }
    if (existing.progress !== "completed" && existing.operationDate !== targetDate) {
      updates.operationDate = targetDate;
    }
    if (Object.keys(updates).length) {
      bulkOps.push({
        updateOne: {
          filter: { _id: existing._id },
          update: { $set: updates },
        },
      });
      updated++;
    }
  }

  if (bulkOps.length) {
    await Operation.bulkWrite(bulkOps, { ordered: false });
  }

  return { created, updated };
}
