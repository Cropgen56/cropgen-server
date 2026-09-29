import ApiLog from "../../models/apiLog.model.js";

export const getApiLogs = async ({
  page = 1,
  limit = 20,
  search,
  method,
  status,
  startDate,
  endDate,
} = {}) => {
  const currentPage = Math.max(Number(page) || 1, 1);
  const pageLimit = Math.max(Number(limit) || 20, 1);
  const skip = (currentPage - 1) * pageLimit;

  const filter = {};

  // Search by API endpoint
  if (search) {
    filter.endpoint = {
      $regex: search,
      $options: "i",
    };
  }

  // Filter by HTTP method
  if (method) {
    filter.method = method;
  }

  // Filter by status code
  if (status) {
    filter.statusCode = Number(status);
  }

  // Filter by date range
  if (startDate || endDate) {
    filter.createdAt = {};

    if (startDate) {
      filter.createdAt.$gte = new Date(startDate);
    }

    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      filter.createdAt.$lte = end;
    }
  }

  const [logs, total] = await Promise.all([
    ApiLog.find(filter)
      .populate("userId", "firstName lastName email")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(pageLimit)
      .lean(),

    ApiLog.countDocuments(filter),
  ]);

  // Convert populated user information into a simple userName
  const formattedLogs = logs.map((log) => ({
    ...log,

    userName:
      log.userId?.email ||
      `${log.userId?.firstName || ""} ${
        log.userId?.lastName || ""
      }`.trim() ||
      "Unknown",

    // Keep the actual user ID as well
    userId: log.userId?._id || null,
  }));

  return {
    logs: formattedLogs,

    pagination: {
      page: currentPage,
      limit: pageLimit,
      total,
      totalPages: Math.ceil(total / pageLimit),
    },
  };
};