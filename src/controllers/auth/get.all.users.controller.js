import User from "../../models/user.model.js";
import UserSubscription from "../../models/user-subscription.model.js";
import { getOrgScopeId, canAccessAdminPanel } from "../../utils/auth/orgScope.js";

export const getAllUsers = async (req, res) => {
  try {
    const { role } = req.user;
    const { page = 1, limit = 10, all = "false" } = req.query;

    if (!canAccessAdminPanel(req.user)) {
      return res.status(403).json({
        success: false,
        message: "Access denied. You do not have permission to view users!",
      });
    }

    const orgId = getOrgScopeId(req.user);
    const baseQuery = orgId
      ? { organization: orgId, deletedAt: null }
      : { deletedAt: null };

    const wantsAll = String(all).toLowerCase() === "true";
    if (
      wantsAll &&
      !orgId &&
      !["admin", "developer"].includes(role)
    ) {
      return res.status(403).json({
        success: false,
        message: "Only admin or developer can fetch all users.",
      });
    }

    const parsedLimit = Math.max(0, parseInt(limit, 10) || 10);
    const parsedPage = Math.max(1, parseInt(page, 10) || 1);

    let users;
    let totalUsers;

    if (wantsAll) {
      users = await User.find(baseQuery)
        .sort({ createdAt: -1 })
        .select("-password -__v")
        .populate({ path: "organization", select: "organizationCode" })
        .lean();
      totalUsers = users.length;
    } else {
      const skip = (parsedPage - 1) * parsedLimit;

      [users, totalUsers] = await Promise.all([
        User.find(baseQuery)
          .sort({ createdAt: -1 })
          .select("-password -__v")
          .populate({ path: "organization", select: "organizationCode" })
          .skip(skip)
          .limit(parsedLimit)
          .lean(),
        User.countDocuments(baseQuery),
      ]);
    }

    if (!users || users.length === 0) {
      return res.status(200).json({
        success: true,
        message: "No users found.",
        users: [],
        pagination: wantsAll
          ? { returned: 0, totalUsers: 0 }
          : { currentPage: parsedPage, totalPages: 1, totalUsers: 0, limit: parsedLimit },
      });
    }

    // Single batch lookup — find all active subscriptions for the fetched users
    const userIds = users.map((u) => u._id);
    const activeSubscriptions = await UserSubscription.find({
      userId: { $in: userIds },
      status: "active",
    })
      .populate({ path: "planId", select: "name slug platform" })
      .select("userId planId billingCycle startDate endDate status")
      .lean();

    // Build a map: userId (string) → subscription
    const subscriptionMap = new Map(
      activeSubscriptions.map((s) => [s.userId.toString(), s])
    );

    // Attach subscription info to each user
    const usersWithSubscription = users.map((user) => {
      const sub = subscriptionMap.get(user._id.toString());
      return {
        ...user,
        subscription: sub
          ? {
              hasActiveSubscription: true,
              plan: sub.planId,
              billingCycle: sub.billingCycle,
              startDate: sub.startDate,
              endDate: sub.endDate,
              status: sub.status,
            }
          : { hasActiveSubscription: false },
      };
    });

    return res.status(200).json({
      success: true,
      message: "Users fetched successfully.",
      users: usersWithSubscription,
      pagination: wantsAll
        ? { returned: users.length, totalUsers }
        : {
            currentPage: parsedPage,
            totalPages: parsedLimit > 0 ? Math.ceil(totalUsers / parsedLimit) : 1,
            totalUsers,
            limit: parsedLimit,
          },
    });
  } catch (error) {
    console.error("Error fetching users:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch users.",
      error: error.message,
    });
  }
};
