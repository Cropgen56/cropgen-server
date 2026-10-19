import FarmAdvisory from "../models/farmAdvisory.model.js";
import {
  getTodayDateISO,
  upsertAdvisoryActivityOperation,
} from "./syncAdvisoryToOperations.service.js";

const VALID_PROGRESS = ["started", "in_progress", "completed"];

const TRACKABLE_TYPES = [
  "SPRAY",
  "FERTIGATION",
  "IRRIGATION",
  "WEATHER",
  "CROP_RISK",
  "MONITORING",
  "CARBON_TRACKING",
];

/**
 * Update progress on one activity in activitiesToDo and sync the linked Operation.
 */
export async function updateAdvisoryActivityProgress({
  advisoryId,
  activityType,
  progress,
}) {
  if (!VALID_PROGRESS.includes(progress)) {
    throw new Error("Invalid progress value");
  }

  if (!TRACKABLE_TYPES.includes(activityType)) {
    throw new Error("Invalid activity type");
  }

  const advisory = await FarmAdvisory.findById(advisoryId);
  if (!advisory) {
    throw new Error("Advisory not found");
  }

  const activityIndex = advisory.activitiesToDo.findIndex(
    (a) => a.type === activityType
  );
  if (activityIndex === -1) {
    throw new Error("Activity not found on this advisory");
  }

  advisory.activitiesToDo[activityIndex].progress = progress;
  advisory.activitiesToDo[activityIndex].completedAt =
    progress === "completed" ? new Date() : null;
  advisory.markModified("activitiesToDo");
  await advisory.save();

  const activity = advisory.activitiesToDo[activityIndex];
  await upsertAdvisoryActivityOperation({
    farmFieldId: advisory.farmFieldId,
    advisoryId: advisory._id,
    activity,
    index: activityIndex,
    operationDate: getTodayDateISO(),
  });

  return advisory;
}
