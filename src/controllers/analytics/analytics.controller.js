import User from "../../models/user.model.js";
import FarmField from "../../models/field.model.js";
import {
  startOfDay,
  endOfDay,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  startOfYear,
  endOfYear,
} from "date-fns";

export const getDashboardAnalytics = async (req, res) => {
  try {
    const { period, startDate, endDate } = req.query;

    const hasDateFilter = Boolean(period || startDate || endDate);

    let start;
    let end = new Date();

    /* ---------------- Date Range Handling ---------------- */
    if (hasDateFilter) {
      switch (period) {
        case "daily":
        case "today":
          start = startOfDay(end);
          end = endOfDay(end);
          break;

        case "weekly":
          start = startOfWeek(end);
          end = endOfWeek(end);
          break;

        case "monthly":
          start = startOfMonth(end);
          end = endOfMonth(end);
          break;

        case "yearly":
          start = startOfYear(end);
          end = endOfYear(end);
          break;

        default:
          start = startDate ? new Date(startDate) : startOfDay(end);
          end = endDate ? new Date(endDate) : endOfDay(end);
      }

      if (start > end) {
        return res.status(400).json({ message: "Invalid date range" });
      }
    }

    /* ---------------- User Metrics ---------------- */

    const totalUsers = await User.countDocuments();

    const newUsers = hasDateFilter
      ? await User.countDocuments({ createdAt: { $gte: start, $lte: end } })
      : totalUsers;

    const activeUsersCount = hasDateFilter
      ? await User.countDocuments({ lastActiveAt: { $gte: start, $lte: end } })
      : await User.countDocuments({ lastActiveAt: { $ne: null } });

    const activeUsers = hasDateFilter
      ? await User.find({ lastActiveAt: { $gte: start, $lte: end } })
          .sort({ lastActiveAt: -1 })
          .select(
            "firstName lastName email phone role clientSource lastActiveAt"
          )
      : await User.find({ lastActiveAt: { $ne: null } })
          .sort({ lastActiveAt: -1 })
          .select(
            "firstName lastName email phone role clientSource lastActiveAt"
          );

    const usersByRole = await User.aggregate([
      { $group: { _id: "$role", count: { $sum: 1 } } },
      { $project: { role: "$_id", count: 1, _id: 0 } },
    ]);

    /* ---------------- Platform Users ---------------- */

    const platformAgg = await User.aggregate([
      ...(hasDateFilter
        ? [{ $match: { createdAt: { $gte: start, $lte: end } } }]
        : []),
      {
        $group: {
          _id: { $ifNull: ["$clientSource", "unknown"] },
          count: { $sum: 1 },
        },
      },
    ]);

    const platformUsers = {
      android: 0,
      web: 0,
      webview: 0,
      unknown: 0,
      total: 0,
    };

    platformAgg.forEach((item) => {
      const key =
        item._id === "android" ||
        item._id === "web" ||
        item._id === "webview"
          ? item._id
          : "unknown";

      platformUsers[key] += item.count;
      platformUsers.total += item.count;
    });

    const newUsersDetails = hasDateFilter
      ? await User.find({ createdAt: { $gte: start, $lte: end } })
          .sort({ createdAt: -1 })
          .select(
            "firstName lastName avatar email phone role clientSource lastLoginAt lastActiveAt createdAt"
          )
      : await User.find()
          .sort({ createdAt: -1 })
          .select(
            "firstName lastName avatar email phone role clientSource lastLoginAt lastActiveAt createdAt"
          );

    /* ---------------- FarmField Metrics ---------------- */

    const totalFields = await FarmField.countDocuments();

    const newFields = hasDateFilter
      ? await FarmField.countDocuments({
          createdAt: { $gte: start, $lte: end },
        })
      : totalFields;

    const fieldsByCrop = await FarmField.aggregate([
      ...(hasDateFilter
        ? [{ $match: { createdAt: { $gte: start, $lte: end } } }]
        : []),
      { $group: { _id: "$cropName", count: { $sum: 1 } } },
      { $project: { crop: "$_id", count: 1, _id: 0 } },
    ]);

    const fieldsByFarmingType = await FarmField.aggregate([
      ...(hasDateFilter
        ? [{ $match: { createdAt: { $gte: start, $lte: end } } }]
        : []),
      { $group: { _id: "$typeOfFarming", count: { $sum: 1 } } },
      { $project: { type: "$_id", count: 1, _id: 0 } },
    ]);

    const fieldsByIrrigation = await FarmField.aggregate([
      ...(hasDateFilter
        ? [{ $match: { createdAt: { $gte: start, $lte: end } } }]
        : []),
      { $group: { _id: "$typeOfIrrigation", count: { $sum: 1 } } },
      { $project: { type: "$_id", count: 1, _id: 0 } },
    ]);

    const newFieldsDetails = hasDateFilter
      ? await FarmField.find({ createdAt: { $gte: start, $lte: end } })
          .sort({ createdAt: -1 })
          .populate("user", "firstName lastName email phone role")
          .select(
            "fieldName cropName variety sowingDate acre typeOfIrrigation typeOfFarming createdAt"
          )
      : await FarmField.find()
          .sort({ createdAt: -1 })
          .populate("user", "firstName lastName email phone role")
          .select(
            "fieldName cropName variety sowingDate acre typeOfIrrigation typeOfFarming createdAt"
          );

    /* ---------------- Final Response ---------------- */

    res.status(200).json({
      period: hasDateFilter ? period : "all",
      users: {
        total: totalUsers,
        new: newUsers,
        activeCount: activeUsersCount,
        activeUsers,
        platformUsers,
        byRole: usersByRole,
      },
      fields: {
        total: totalFields,
        new: newFields,
        byCrop: fieldsByCrop,
        byFarmingType: fieldsByFarmingType,
        byIrrigation: fieldsByIrrigation,
        newDetails: newFieldsDetails,
      },
    });
  } catch (error) {
    console.error("Dashboard analytics error:", error);
    res.status(500).json({ message: error.message });
  }
};
