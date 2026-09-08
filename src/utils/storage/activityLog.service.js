import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LOG_DIR = path.join(__dirname, "storage");
const LOG_FILE = path.join(LOG_DIR, "activity-logs.json");

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
  try {
    await fs.mkdir(LOG_DIR, { recursive: true });

    let logs = [];

    try {
      const data = await fs.readFile(LOG_FILE, "utf-8");
      logs = JSON.parse(data);

      if (!Array.isArray(logs)) {
        logs = [];
      }
    } catch (error) {
      if (error.code !== "ENOENT") {
        console.error(
          "Failed to read existing activity logs:",
          error.message
        );
      }

      logs = [];
    }

    const newLog = {
      id: Date.now().toString(),
      userId: userId || null,
      userName: userName || "Unknown",
      action: action || "UNKNOWN",
      module: module || "Unknown",
      description: description || "",
      dateTime: new Date().toISOString(),
      status: status || "SUCCESS",
    };

    logs.unshift(newLog);

    await fs.writeFile(
      LOG_FILE,
      JSON.stringify(logs, null, 2),
      "utf-8"
    );

    return newLog;
  } catch (error) {
    console.error("Activity log error:", error.message);
    return null;
  }
}

/**
 * Read all activity logs.
 */
export async function getActivityLogs() {
  try {
    try {
      const data = await fs.readFile(LOG_FILE, "utf-8");

      const logs = JSON.parse(data);

      return Array.isArray(logs) ? logs : [];
    } catch (error) {
      if (error.code === "ENOENT") {
        return [];
      }

      throw error;
    }
  } catch (error) {
    console.error(
      "Failed to read activity logs:",
      error.message
    );

    throw error;
  }
}