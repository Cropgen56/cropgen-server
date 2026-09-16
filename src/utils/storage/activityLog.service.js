import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LOG_DIR = __dirname;
const LOG_FILE = path.join(LOG_DIR, "activity-logs.json");

// Hard cap so the file (and every read of it) can't grow without bound.
const MAX_LOGS = 5000;

async function readLogsFromDisk() {
  try {
    const data = await fs.readFile(LOG_FILE, "utf-8");
    const logs = JSON.parse(data);
    return Array.isArray(logs) ? logs : [];
  } catch (error) {
    if (error.code === "ENOENT") return [];
    console.error("Failed to read activity logs:", error.message);
    return [];
  }
}

// All reads-then-writes are chained onto this promise so concurrent
// logActivity() calls can't race each other and drop entries.
let writeQueue = Promise.resolve();

/**
 * Write a new activity log.
 */
export async function logActivity({
  userId,
  userName,
  action,
  module,
  description,
  status = "SUCCESS",
}) {
  const newLog = {
    id: crypto.randomUUID(),
    userId: userId || null,
    userName: userName || "Unknown",
    action: action || "UNKNOWN",
    module: module || "Unknown",
    description: description || "",
    dateTime: new Date().toISOString(),
    status: status || "SUCCESS",
  };

  writeQueue = writeQueue.then(async () => {
    const logs = await readLogsFromDisk();
    logs.unshift(newLog);
    logs.length = Math.min(logs.length, MAX_LOGS);

    await fs.mkdir(LOG_DIR, { recursive: true });
    await fs.writeFile(LOG_FILE, JSON.stringify(logs, null, 2), "utf-8");
  });

  try {
    await writeQueue;
  } catch (error) {
    console.error("Activity log error:", error.message);
    return null;
  }

  return newLog;
}

/**
 * Read activity logs with optional search, filters, and pagination.
 * Also returns the distinct filter values available across all logs,
 * so the UI can populate its filter dropdowns.
 */
export async function getActivityLogs({
  page = 1,
  limit = 20,
  search = "",
  module,
  action,
  status,
  startDate,
  endDate,
} = {}) {
  const logs = await readLogsFromDisk();

  const filterOptions = {
    modules: [...new Set(logs.map((log) => log.module).filter(Boolean))].sort(),
    actions: [...new Set(logs.map((log) => log.action).filter(Boolean))].sort(),
    statuses: [...new Set(logs.map((log) => log.status).filter(Boolean))].sort(),
  };

  let filtered = logs;

  if (module) filtered = filtered.filter((log) => log.module === module);
  if (action) filtered = filtered.filter((log) => log.action === action);
  if (status) filtered = filtered.filter((log) => log.status === status);

  const startTime = startDate ? new Date(startDate).getTime() : NaN;
  if (!Number.isNaN(startTime)) {
    filtered = filtered.filter(
      (log) => new Date(log.dateTime).getTime() >= startTime
    );
  }

  const endTime = endDate ? new Date(endDate).getTime() : NaN;
  if (!Number.isNaN(endTime)) {
    filtered = filtered.filter(
      (log) => new Date(log.dateTime).getTime() <= endTime
    );
  }

  const term = String(search || "").trim().toLowerCase();
  if (term) {
    filtered = filtered.filter((log) =>
      [log.userName, log.action, log.module, log.description, log.status]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(term))
    );
  }

  const total = filtered.length;
  const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
  const totalPages = Math.max(Math.ceil(total / safeLimit), 1);
  const safePage = Math.min(Math.max(parseInt(page, 10) || 1, 1), totalPages);

  const start = (safePage - 1) * safeLimit;
  const paginatedLogs = filtered.slice(start, start + safeLimit);

  return {
    logs: paginatedLogs,
    pagination: {
      page: safePage,
      limit: safeLimit,
      total,
      totalPages,
    },
    filterOptions,
  };
}
