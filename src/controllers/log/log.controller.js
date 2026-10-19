import { getActivityLogs } from "../../utils/storage/activityLog.service.js";
import { getApiLogs } from "../../utils/storage/apiLog.service.js";

export const getLogs = async (req, res) => {
  try {
    const {
      page,
      limit,
      search,
      module,
      action,
      status,
      startDate,
      endDate,
      method,
    } = req.query;

    const activityLogs = await getActivityLogs({
      page,
      limit,
      search,
      module,
      action,
      status,
      startDate,
      endDate,
    });

    const apiLogs = await getApiLogs({
      page,
      limit,
      search,
      method,
      status,
      startDate,
      endDate,
    });

    return res.status(200).json({
      success: true,

      // Keep the original structure for existing Activity Logs UI
      data: activityLogs.logs,
      pagination: activityLogs.pagination,
      filterOptions: activityLogs.filterOptions,

      // New API Logs
      apiLogs: apiLogs.logs,
      apiPagination: apiLogs.pagination,
    });
  } catch (error) {
    console.error("Failed to fetch logs:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch logs",
    });
  }
};
