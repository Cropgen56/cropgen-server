import User from "../../../../models/user.model.js";
import FarmField from "../../../../models/field.model.js";
import UserSubscription from "../../../../models/user-subscription.model.js";
import { resolveCrmUserBaseQuery } from "../../utils/crmUserQuery.js";
import { formatCrmFarmer } from "../../utils/formatFarmer.js";

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

export const listBiodropsFarmers = async (req, res) => {
  try {
    const { baseQuery, org } = await resolveCrmUserBaseQuery(req);
    const { page = 1, limit = 20, search } = req.query;

    const parsedLimit = Math.max(1, Math.min(100, parseInt(limit, 10) || 20));
    const parsedPage = Math.max(1, parseInt(page, 10) || 1);
    const skip = (parsedPage - 1) * parsedLimit;

    let query = {
      ...baseQuery,
      role: "farmer",
      organization: org._id,
    };

    const searchFilter = buildFarmerSearchFilter(search);
    if (searchFilter) {
      query = { $and: [query, searchFilter] };
    }

    const [farmers, total] = await Promise.all([
      User.find(query)
        .sort({ createdAt: -1 })
        .select("-password -otp -__v")
        .skip(skip)
        .limit(parsedLimit)
        .lean(),
      User.countDocuments(query),
    ]);

    if (!farmers.length) {
      return res.status(200).json({
        success: true,
        farmers: [],
        pagination: {
          page: parsedPage,
          currentPage: parsedPage,
          totalPages: 1,
          total,
          limit: parsedLimit,
        },
      });
    }

    const userIds = farmers.map((u) => u._id);

    const [fields, subscriptions] = await Promise.all([
      FarmField.find({ user: { $in: userIds } })
        .select("user cropName acre fieldName updatedAt")
        .sort({ updatedAt: -1 })
        .lean(),
      UserSubscription.find({ userId: { $in: userIds } })
        .sort({ updatedAt: -1 })
        .lean(),
    ]);

    const fieldsByUser = new Map();
    for (const field of fields) {
      const key = String(field.user);
      if (!fieldsByUser.has(key)) fieldsByUser.set(key, []);
      fieldsByUser.get(key).push(field);
    }

    const subscriptionByUser = new Map();
    for (const sub of subscriptions) {
      const key = String(sub.userId);
      const existing = subscriptionByUser.get(key);
      if (!existing) {
        subscriptionByUser.set(key, sub);
        continue;
      }
      const rank = (s) =>
        s.status === "active" ? 3 : s.status === "pending" ? 2 : 1;
      if (rank(sub) > rank(existing)) {
        subscriptionByUser.set(key, sub);
      }
    }

    const formatted = farmers.map((user) =>
      formatCrmFarmer(user, {
        fields: fieldsByUser.get(String(user._id)) || [],
        subscription: subscriptionByUser.get(String(user._id)) || null,
      }),
    );

    return res.status(200).json({
      success: true,
      farmers: formatted,
      pagination: {
        page: parsedPage,
        currentPage: parsedPage,
        totalPages: Math.max(1, Math.ceil(total / parsedLimit)),
        total,
        limit: parsedLimit,
      },
    });
  } catch (error) {
    const status = error.status || 500;
    if (status >= 500) console.error("listBiodropsFarmers:", error);
    return res.status(status).json({
      success: false,
      message: error.message || "Failed to load farmers.",
    });
  }
};

export const getBiodropsFarmerStats = async (req, res) => {
  try {
    const { baseQuery, org } = await resolveCrmUserBaseQuery(req);

    const query = {
      ...baseQuery,
      role: "farmer",
      organization: org._id,
    };

    const farmerIds = await User.find(query).select("_id").lean();
    const userIds = farmerIds.map((u) => u._id);
    const total = userIds.length;

    if (!total) {
      return res.status(200).json({
        success: true,
        stats: {
          total: 0,
          active: 0,
          withFields: 0,
          totalAcres: 0,
        },
      });
    }

    const [activeSubs, fieldAgg] = await Promise.all([
      UserSubscription.countDocuments({
        userId: { $in: userIds },
        status: "active",
      }),
      FarmField.aggregate([
        { $match: { user: { $in: userIds } } },
        {
          $group: {
            _id: "$user",
            acres: { $sum: "$acre" },
          },
        },
        {
          $group: {
            _id: null,
            farmersWithFields: { $sum: 1 },
            totalAcres: { $sum: "$acres" },
          },
        },
      ]),
    ]);

    const agg = fieldAgg[0] || { farmersWithFields: 0, totalAcres: 0 };

    return res.status(200).json({
      success: true,
      stats: {
        total,
        active: activeSubs,
        withFields: agg.farmersWithFields || 0,
        totalAcres: Math.round((agg.totalAcres || 0) * 10) / 10,
      },
    });
  } catch (error) {
    const status = error.status || 500;
    if (status >= 500) console.error("getBiodropsFarmerStats:", error);
    return res.status(status).json({
      success: false,
      message: error.message || "Failed to load farmer stats.",
    });
  }
};
