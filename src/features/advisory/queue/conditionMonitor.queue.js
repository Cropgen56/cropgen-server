import pkg from "bullmq";
import { createRedisConnection } from "../../../config/redisConnection.js";
import { runConditionMonitorForCrop, runConditionMonitorForField } from "../services/conditionMonitor.service.js";

const { Queue, Worker } = pkg;

/** Uses the same switch as the advisory queue: without Redis, jobs run inline. */
const QUEUE_ENABLED = String(process.env.ADVISORY_QUEUE_ENABLED || "").toLowerCase() === "true";
const QUEUE_NAME = process.env.MONITOR_QUEUE_NAME || "conditionMonitorQueue";
const CONCURRENCY = Math.max(1, Number(process.env.MONITOR_QUEUE_CONCURRENCY) || 3);

let queue = null;
let worker = null;
let connection = null;

function getConnection() {
  if (!connection) connection = createRedisConnection();
  return connection;
}

function getQueue() {
  if (!QUEUE_ENABLED) return null;
  if (!queue) {
    queue = new Queue(QUEUE_NAME, {
      connection: getConnection(),
      defaultJobOptions: {
        attempts: 2,
        backoff: { type: "exponential", delay: 5000 },
        removeOnComplete: 1000,
        removeOnFail: 2000,
      },
    });
  }
  return queue;
}

/** De-duplicates repeat triggers for the same crop within the same hour. */
function jobIdFor({ farmFieldId, cropInstanceId, trigger }) {
  const hour = new Date().toISOString().slice(0, 13);
  return `monitor:${farmFieldId}:${cropInstanceId || "all"}:${trigger}:${hour}`;
}

/**
 * Ask for a condition check. Safe to call from anywhere (advisory module,
 * operation completed, satellite webhook): never throws.
 * @param {{ farmFieldId: string, cropInstanceId?: string|null, trigger?: string, delayMs?: number }} p
 */
export async function enqueueConditionCheck({ farmFieldId, cropInstanceId = null, trigger = "manual", delayMs = 0 }) {
  if (String(process.env.CONDITION_MONITOR_ENABLED || "false").toLowerCase() !== "true") return { skipped: "disabled" };
  const payload = { farmFieldId: String(farmFieldId), cropInstanceId: cropInstanceId ? String(cropInstanceId) : null, trigger };
  try {
    const q = getQueue();
    if (q) {
      const job = await q.add("condition-check", payload, { jobId: jobIdFor(payload), delay: delayMs });
      return { queued: true, jobId: job?.id };
    }
    // No Redis: run in the background of this process.
    setTimeout(() => {
      const run = payload.cropInstanceId ? runConditionMonitorForCrop(payload) : runConditionMonitorForField(payload);
      run.catch((err) => console.error(`[Monitor] inline run failed for ${payload.farmFieldId}:`, err?.message || err));
    }, delayMs);
    return { queued: false, inline: true };
  } catch (err) {
    console.error("[Monitor] enqueue failed:", err?.message || err);
    return { error: err?.message || String(err) };
  }
}

export function startConditionMonitorQueueWorker() {
  if (!QUEUE_ENABLED || worker) return null;
  worker = new Worker(
    QUEUE_NAME,
    async (job) => {
      const { farmFieldId, cropInstanceId = null, trigger = "manual" } = job.data || {};
      if (!farmFieldId) throw new Error("farmFieldId required");
      return cropInstanceId
        ? runConditionMonitorForCrop({ farmFieldId, cropInstanceId, trigger })
        : runConditionMonitorForField({ farmFieldId, trigger });
    },
    { connection: getConnection(), concurrency: CONCURRENCY },
  );
  worker.on("failed", (job, err) => console.error(`[MonitorQueue] job failed (${job?.id}):`, err?.message || err));
  return worker;
}
