import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LOG_FILE = path.join(
  __dirname,
  "storage",
  "activity-logs.json"
);

export async function logActivity({
  userId,
  userName,
  action,
  module,
  description,
  status = "SUCCESS",
}) {
  try {
    let logs = [];

    try {
      const data = await fs.readFile(LOG_FILE, "utf-8");
      logs = JSON.parse(data);
    } catch {
      logs = [];
    }

    const newLog = {
      id: Date.now().toString(),
      userId: userId || null,
      userName: userName || "Unknown",
      action,
      module,
      description,
      dateTime: new Date().toISOString(),
      status,
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