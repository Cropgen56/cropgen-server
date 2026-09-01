import User from "../../../../models/user.model.js";
import FarmField from "../../../../models/field.model.js";
import FieldCrop from "../../../../models/field-crop.model.js";
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

/**
 * Farmers list = every account registered under the org (farmer, staff,
 * admin alike) — matches cropgen-admin-panel's generic "all users" view
 * filtered to this org. Not just role:"farmer": a BioDrops staff/admin
 * login is still a BIODROPS org account and belongs on this list even with
 * zero farms of their own.
 */
export async function buildFarmerRoleQuery(baseQuery, org) {
  return {
    ...baseQuery,
    organization: org._id,
    // Matches getAllUsers' reference baseQuery — soft-deleted accounts don't
    // belong on any admin-facing list.
    deletedAt: null,
  };
}

export const listBiodropsFarmers = async (req, res) => {
  try {
    const { baseQuery, org } = await resolveCrmUserBaseQuery(req);
    const { page = 1, limit = 20, search } = req.query;

    const parsedLimit = Math.max(1, Math.min(100, parseInt(limit, 10) || 20));
    const parsedPage = Math.max(1, parseInt(page, 10) || 1);
    const skip = (parsedPage - 1) * parsedLimit;

    let query = await buildFarmerRoleQuery(baseQuery, org);

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

    const fields = await FarmField.find({ user: { $in: userIds } })
      .select("user cropName acre fieldName updatedAt")
      .sort({ updatedAt: -1 })
      .lean();

    // Multi-crop: attach each field's currently-active crops so the crop
    // roll-up below reflects all of them, not just the legacy singular one.
    const fieldIds = fields.map((f) => f._id);
    const activeCrops = fieldIds.length
      ? await FieldCrop.find({ farmField: { $in: fieldIds }, isActive: true })
          .select("farmField cropName")
          .lean()
      : [];
    const cropsByFieldId = new Map();
    activeCrops.forEach((c) => {
      const key = String(c.farmField);
      if (!cropsByFieldId.has(key)) cropsByFieldId.set(key, []);
      cropsByFieldId.get(key).push(c);
    });
    const fieldsWithCrops = fields.map((f) => ({
      ...f,
      crops: cropsByFieldId.get(String(f._id)) || [],
    }));

    const fieldsByUser = new Map();
    for (const field of fieldsWithCrops) {
      const key = String(field.user);
      if (!fieldsByUser.has(key)) fieldsByUser.set(key, []);
      fieldsByUser.get(key).push(field);
    }

    const formatted = farmers.map((user) =>
      formatCrmFarmer(user, {
        fields: fieldsByUser.get(String(user._id)) || [],
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

    const query = await buildFarmerRoleQuery(baseQuery, org);

    const farmerIds = await User.find(query).select("_id").lean();
    const userIds = farmerIds.map((u) => u._id);
    const total = userIds.length;

    if (!total) {
      return res.status(200).json({
        success: true,
        stats: {
          total: 0,
          recentlyActive: 0,
          withFields: 0,
          totalAcres: 0,
        },
      });
    }

    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000);

    const [recentlyActive, fieldAgg] = await Promise.all([
      User.countDocuments({
        _id: { $in: userIds },
        $or: [
          { lastActiveAt: { $gte: thirtyDaysAgo } },
          { lastLoginAt: { $gte: thirtyDaysAgo } },
        ],
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
        recentlyActive,
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
