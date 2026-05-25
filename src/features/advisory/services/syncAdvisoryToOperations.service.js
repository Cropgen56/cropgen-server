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

function buildOperationFromActivity(activity, index, { farmFieldId, advisoryId, operationDate }) {
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
