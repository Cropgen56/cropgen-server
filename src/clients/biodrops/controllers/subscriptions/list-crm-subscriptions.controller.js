import User from "../../../../models/user.model.js";
import UserSubscription from "../../../../models/user-subscription.model.js";
import { resolveCrmUserBaseQuery } from "../../utils/crmUserQuery.js";
import { formatCrmSubscriptionRow } from "../../utils/subscriptionRowFormat.js";

function buildFarmerSearchFilter(search) {
  if (!search?.trim()) return null;
  const q = search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return {
    $or: [
      { firstName: { $regex: q, $options: "i" } },
      { lastName: { $regex: q, $options: "i" } },
      { phone: { $regex: q, $options: "i" } },
      { email: { $regex: q, $options: "i" } },
    ],
  };
}

export async function listCrmSubscriptions(req, res) {
  try {
    const { baseQuery, org } = await resolveCrmUserBaseQuery(req);
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 25));
    const skip = (page - 1) * limit;
    const { status, search } = req.query;

    let farmerQuery = {
      ...baseQuery,
      role: "farmer",
      organization: org._id,
    };

    const searchFilter = buildFarmerSearchFilter(search);
    if (searchFilter) {
      farmerQuery = { $and: [farmerQuery, searchFilter] };
    }

    const farmers = await User.find(farmerQuery).select("_id").lean();
    const farmerIds = farmers.map((f) => f._id);

    if (!farmerIds.length) {
      return res.status(200).json({
        success: true,
        data: [],
        pagination: { page, limit, total: 0, totalPages: 1 },
      });
    }

    const filter = { userId: { $in: farmerIds } };
    if (status) filter.status = status;

    const [rows, total] = await Promise.all([
      UserSubscription.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("userId", "firstName lastName phone email avatar village district state")
        .populate("fieldId", "fieldName acre cropName")
        .populate("planId", "name slug brand platform isInternal")
        .lean(),
      UserSubscription.countDocuments(filter),
    ]);

    return res.status(200).json({
      success: true,
      data: rows.map(formatCrmSubscriptionRow),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    });
  } catch (error) {
    const statusCode = error.status || 500;
    if (statusCode >= 500) console.error("listCrmSubscriptions:", error);
    return res.status(statusCode).json({
      success: false,
      message: error.message || "Failed to load subscribers",
    });
  }
}
