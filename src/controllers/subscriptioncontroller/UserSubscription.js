import UserSubscription from "../../models/usersubscription.model.js";
import mongoose from "mongoose";

/* ================= GET ALL (PAGINATED) ================= */
export const getUserSubscriptions = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);
    const search = req.query.search?.trim() || "";
    const platform = req.query.platform || "";

    const skip = (page - 1) * limit;

    /* ================= MATCH FILTER ================= */

    const matchStage = {};

    if (platform) {
      matchStage.platform = platform;
    }

    /* ================= SEARCH FILTER ================= */

    const searchMatch = search
      ? {
          $or: [
            { "user.firstName": { $regex: search, $options: "i" } },
            { "user.lastName": { $regex: search, $options: "i" } },
            { "user.email": { $regex: search, $options: "i" } },
            { "user.phone": { $regex: search, $options: "i" } },
          ],
        }
      : {};

    /* ================= AGGREGATION ================= */

    const pipeline = [
      { $match: matchStage },

      {
        $lookup: {
          from: "users",
          localField: "userId",
          foreignField: "_id",
          as: "user",
        },
      },
      { $unwind: "$user" },

      {
        $lookup: {
          from: "subscriptionplans",
          localField: "planId",
          foreignField: "_id",
          as: "plan",
        },
      },
      { $unwind: { path: "$plan", preserveNullAndEmptyArrays: true } },

      ...(search ? [{ $match: searchMatch }] : []),

      { $sort: { createdAt: -1 } },

      {
        $facet: {
          data: [{ $skip: skip }, { $limit: limit }],
          totalCount: [{ $count: "count" }],
        },
      },
    ];

    const result = await UserSubscription.aggregate(pipeline);

    const subscriptions = result[0].data;
    const total = result[0].totalCount[0]?.count || 0;

    return res.status(200).json({
      data: subscriptions,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error("❌ getUserSubscriptions error:", error);
    return res.status(500).json({
      message: "Failed to fetch subscriptions",
    });
  }
};

/* ================= GET ONE ================= */
export const getUserSubscriptionById = async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({
      success: false,
      message: "Invalid subscription ID",
    });
  }

  const subscription = await UserSubscription.findById(id)
    .populate("userId", "name email")
    .populate("fieldId", "name")
    .populate("planId", "name slug pricing")
    .lean();

  if (!subscription) {
    return res.status(404).json({
      success: false,
      message: "Subscription not found",
    });
  }

  res.json({
    success: true,
    data: subscription,
  });
};

/* ================= UPDATE ================= */
export const updateUserSubscription = async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({
      success: false,
      message: "Invalid subscription ID",
    });
  }

  const updateData = { ...req.body };

  if (updateData.area && updateData.pricePerUnitMinor) {
    updateData.totalAmountMinor =
      updateData.area * updateData.pricePerUnitMinor;
  }

  const updated = await UserSubscription.findByIdAndUpdate(id, updateData, {
    new: true,
    runValidators: true,
  });

  if (!updated) {
    return res.status(404).json({
      success: false,
      message: "Subscription not found",
    });
  }

  res.json({
    success: true,
    data: updated,
  });
};

/* ================= DELETE ================= */
export const deleteUserSubscription = async (req, res) => {
  const { id } = req.params;

  const deleted = await UserSubscription.findByIdAndDelete(id);

  if (!deleted) {
    return res.status(404).json({
      success: false,
      message: "Subscription not found",
    });
  }

  res.json({
    success: true,
    message: "Subscription deleted successfully",
  });
};
