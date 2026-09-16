import { getActivityLogs } from "../../utils/storage/activityLog.service.js";

export const getLogs = async (req, res) => {
  try {
    const { page, limit, search, module, action, status, startDate, endDate } =
      req.query;

    const { logs, pagination, filterOptions } = await getActivityLogs({
      page,
      limit,
      search,
      module,
      action,
      status,
      startDate,
      endDate,
    });

    return res.status(200).json({
      success: true,
      data: logs,
      pagination,
      filterOptions,
    });
  } catch (error) {
    console.error("Failed to fetch activity logs:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch activity logs",
    });
  }
};
