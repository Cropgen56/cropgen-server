import { getActivityLogs } from "../../utils/storage/activityLog.service.js";

export const getLogs = async (req, res) => {
  try {
    const logs = await getActivityLogs();

    return res.status(200).json({
      success: true,
      data: logs,
    });
  } catch (error) {
    console.error("Failed to fetch activity logs:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch activity logs",
    });
  }
};