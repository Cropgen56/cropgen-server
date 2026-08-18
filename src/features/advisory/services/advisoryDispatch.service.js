import {
  ADVISORY_QUEUE_ENABLED,
  enqueueAdvisoryJob,
} from "../queue/advisory.queue.js";
import { generateAdvisoryForField } from "./advisory.service.js";

export async function dispatchAdvisoryGeneration({
  farmFieldId,
  aoiId,
  language,
  platform = "whatsapp",
  options = {},
  jobId,
  cropInstanceId = null,
}) {
  if (ADVISORY_QUEUE_ENABLED) {
    const job = await enqueueAdvisoryJob(
      {
        farmFieldId: String(farmFieldId),
        aoiId: String(aoiId),
        language: language || "en",
        platform,
        options,
        cropInstanceId: cropInstanceId ? String(cropInstanceId) : null,
      },
      { jobId },
    );
    return {
      queued: true,
      jobId: job?.id || jobId || null,
    };
  }

  const advisory = await generateAdvisoryForField(
    farmFieldId,
    aoiId,
    language || "en",
    platform,
    options,
    cropInstanceId,
  );
  return {
    queued: false,
    advisory,
    advisoryId: String(advisory?._id || ""),
  };
}

