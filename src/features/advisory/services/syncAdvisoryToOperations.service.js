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

function padTime(hour) {
  const h = Math.min(Math.max(hour, 0), 23);
  return `${String(h).padStart(2, "0")}:00:00`;
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

export function getTodayDateISO(date = new Date()) {
  return date.toISOString().slice(0, 10);
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
    operationTime: padTime(8 + index),
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

  const operationDate = generatedAt.toISOString().slice(0, 10);
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
      operationDate,
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
 * Uses today's date so tasks appear in the month the farmer is viewing.
 */
export async function upsertAdvisoryActivityOperation({
  farmFieldId,
  advisoryId,
  activity,
  index = 0,
  operationDate = getTodayDateISO(),
}) {
  if (!farmFieldId || !advisoryId || !activity?.type) {
    return null;
  }

  const payload = buildOperationFromActivity(activity, index, {
    farmFieldId,
    advisoryId,
    operationDate,
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
 * Ensure each activity on the latest advisory has a calendar operation (non-destructive).
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
  const operationDate = getTodayDateISO();
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

    if (!existing) {
      const doc = buildOperationFromActivity(activity, i, {
        farmFieldId,
        advisoryId,
        operationDate,
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
    if (existing.progress !== "completed" && existing.operationDate !== operationDate) {
      updates.operationDate = operationDate;
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
