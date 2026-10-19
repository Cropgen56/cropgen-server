import pkg from "bullmq";
import { createRedisConnection } from "../../../config/redisConnection.js";
import { generateAdvisoryForField } from "../services/advisory.service.js";

const { Queue, Worker } = pkg;

export const ADVISORY_QUEUE_ENABLED =
  String(process.env.ADVISORY_QUEUE_ENABLED || "").toLowerCase() === "true";
const ADVISORY_QUEUE_NAME = process.env.ADVISORY_QUEUE_NAME || "advisoryQueue";
const ADVISORY_QUEUE_CONCURRENCY = Math.max(
  1,
  Number(process.env.ADVISORY_QUEUE_CONCURRENCY) || 2,
);

let queue = null;
let worker = null;
let connection = null;

function getConnection() {
  if (!connection) {
    connection = createRedisConnection();
  }
  return connection;
}

export function getAdvisoryQueue() {
  if (!ADVISORY_QUEUE_ENABLED) return null;
  if (!queue) {
    queue = new Queue(ADVISORY_QUEUE_NAME, {
      connection: getConnection(),
      defaultJobOptions: {
        attempts: 2,
        backoff: { type: "exponential", delay: 1000 },
        removeOnComplete: 500,
        removeOnFail: 2000,
      },
    });
  }
  return queue;
}

export async function enqueueAdvisoryJob(payload, opts = {}) {
  const advisoryQueue = getAdvisoryQueue();
  if (!advisoryQueue) return null;
  const farmFieldId = String(payload.farmFieldId || "");
  const cropInstanceId = payload.cropInstanceId
    ? String(payload.cropInstanceId)
    : "primary";
  const dayKey = new Date().toISOString().slice(0, 10);
  const jobId =
    opts.jobId || `advisory:${farmFieldId}:${cropInstanceId}:${dayKey}`;
  return advisoryQueue.add("generate-advisory", payload, {
    jobId,
    ...opts,
  });
}

export function startAdvisoryQueueWorker() {
  if (!ADVISORY_QUEUE_ENABLED || worker) return null;
  worker = new Worker(
    ADVISORY_QUEUE_NAME,
    async (job) => {
      const {
        farmFieldId,
        aoiId,
        language,
        platform = "whatsapp",
        options = {},
        cropInstanceId = null,
      } = job.data || {};
      if (!farmFieldId || !aoiId) {
        throw new Error("farmFieldId and aoiId are required");
      }
      const advisory = await generateAdvisoryForField(
        farmFieldId,
        aoiId,
        language || "en",
        platform,
        options,
        cropInstanceId,
      );
      return { advisoryId: String(advisory?._id || "") };
    },
    {
      connection: getConnection(),
      concurrency: ADVISORY_QUEUE_CONCURRENCY,
    },
  );

  worker.on("failed", (job, err) => {
    console.error(
      `[AdvisoryQueue] job failed (${job?.id || "unknown"}):`,
      err?.message || err,
    );
  });
  worker.on("completed", (job, result) => {
    console.log(
      `[AdvisoryQueue] job completed (${job.id}): advisory=${result?.advisoryId || "n/a"}`,
    );
  });
  return worker;
}

