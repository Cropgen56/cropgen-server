import mongoose from "mongoose";
import User from "../../../../models/user.model.js";
import FarmField from "../../../../models/field.model.js";
import FieldCrop from "../../../../models/field-crop.model.js";
import { resolveCrmUserBaseQuery } from "../../utils/crmUserQuery.js";
import { formatCrmFarmer } from "../../utils/formatFarmer.js";
import { isClientViewer } from "../../utils/clientOrg.js";

/** Admin-only ?clientId= filter ("none" = farmers not under any client). */
function buildClientFilter(req, clientId) {
  if (!clientId || isClientViewer(req.adminActor)) return null;
  if (clientId === "none") return { clientOrganization: null };
  // Every farmer registered under any client organization.
  if (clientId === "any") return { clientOrganization: { $ne: null } };
  if (!mongoose.Types.ObjectId.isValid(clientId)) return null;
  return { clientOrganization: new mongoose.Types.ObjectId(clientId) };
}

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const FARMER_TEXT_FIELDS = [
  "firstName",
  "lastName",
  "email",
  "phone",
  "village",
  "city",
  "district",
  "state",
];

/** One search word → $or over the fields the table shows. */
function buildFarmerTermFilter(term) {
  const rx = { $regex: escapeRegex(term), $options: "i" };
  const or = FARMER_TEXT_FIELDS.map((field) => ({ [field]: rx }));

  // Phone-like word ("+91-93223", "(932)"): match on digits only.
  const digits = term.replace(/\D/g, "");
  const phoneChars = term.replace(/[\s+\-().]/g, "");
  if (digits.length >= 3 && digits.length === phoneChars.length && digits !== term) {
    or.push({ phone: { $regex: digits } });
  }

  // Farmer ID as shown in the table: FR-<last 6 hex of _id>.
  const idMatch = term.match(/^fr-?([0-9a-f]{1,6})$/i);
  if (idMatch) {
    or.push({
      $expr: {
        $regexMatch: {
          input: { $toString: "$_id" },
          // Prefix of the 6-char suffix, e.g. "FR-21C" → /21c[0-9a-f]{3}$/
          regex: `${idMatch[1]}[0-9a-f]{${6 - idMatch[1].length}}$`,
          options: "i",
        },
      },
    });
  }

  return { $or: or };
}

/**
 * Every whitespace-separated word must match (AND), so "vishal maske",
 * "maske vishal", "vishal shivne" and "93223 96236" all work.
 */
export function buildFarmerSearchFilter(search) {
  const terms = String(search || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 8);
  if (!terms.length) return null;
  const filters = terms.map(buildFarmerTermFilter);
  return filters.length === 1 ? filters[0] : { $and: filters };
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
    const { page = 1, limit = 20, search, clientId } = req.query;

    const parsedLimit = Math.max(1, Math.min(100, parseInt(limit, 10) || 20));
    const parsedPage = Math.max(1, parseInt(page, 10) || 1);
    const skip = (parsedPage - 1) * parsedLimit;

    let query = await buildFarmerRoleQuery(baseQuery, org);

    const filters = [
      buildFarmerSearchFilter(search),
      buildClientFilter(req, clientId),
    ].filter(Boolean);
    if (filters.length) {
      query = { $and: [query, ...filters] };
    }

    const [farmers, total] = await Promise.all([
      User.find(query)
        .sort({ createdAt: -1 })
        .select("-password -otp -__v")
        .populate("clientOrganization", "organizationName organizationCode")
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
