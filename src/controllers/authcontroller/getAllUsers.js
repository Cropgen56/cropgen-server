import User from "../../models/usersModel.js";

// Fetch all users (paginated by default). Admins/developers can pass ?all=true to fetch every user.
export const getAllUsers = async (req, res) => {
  try {
    const { role, organization } = req.user;
    const { page = 1, limit = 10, all = "false" } = req.query;

    // Role check: only these roles can view users at all
    if (!["admin", "developer", "client"].includes(role)) {
      return res.status(403).json({
        success: false,
        message: "Access denied. You do not have permission to view users!",
      });
    }

    // Base query: clients only see users from their organization
    const baseQuery = role === "client" ? { organization } : {};

    // If "all=true" requested, only allow for admin/developer
    const wantsAll = String(all).toLowerCase() === "true";
    if (wantsAll && !["admin", "developer"].includes(role)) {
      return res.status(403).json({
        success: false,
        message: "Only admin or developer can fetch all users.",
      });
    }

    // Build query and options
    const finalQuery = { ...baseQuery };

    // sanitize and parse pagination params
    const parsedLimit = Math.max(0, parseInt(limit, 10) || 10);
    const parsedPage = Math.max(1, parseInt(page, 10) || 1);

    let users;
    let totalUsers;

    if (wantsAll) {
      // Fetch every matching user (no pagination). Be careful with very large collections.
      users = await User.find(finalQuery)
        .sort({ createdAt: -1 })
        .select("-password -__v")
        .populate({ path: "organization", select: "organizationCode" })
        .lean();
      totalUsers = users.length;
    } else {
      const skip = (parsedPage - 1) * parsedLimit;

      // fetch paginated results
      users = await User.find(finalQuery)
        .sort({ createdAt: -1 })
        .select("-password -__v")
        .populate({ path: "organization", select: "organizationCode" })
        .skip(skip)
        .limit(parsedLimit)
        .lean();

      totalUsers = await User.countDocuments(finalQuery);
    }

    // If you prefer empty result rather than 404 when no users found, change status accordingly.
    if (!users || users.length === 0) {
      return res.status(200).json({
        success: true,
        message: "No users found.",
        users: [],
        pagination: wantsAll
          ? { returned: 0, totalUsers: 0 }
          : {
              currentPage: parsedPage,
              totalPages:
                parsedLimit > 0 ? Math.ceil(totalUsers / parsedLimit) : 1,
              totalUsers,
              limit: parsedLimit,
            },
      });
    }

    // Success response
    return res.status(200).json({
      success: true,
      message: "Users fetched successfully.",
      users,
      pagination: wantsAll
        ? { returned: users.length, totalUsers }
        : {
            currentPage: parsedPage,
            totalPages:
              parsedLimit > 0 ? Math.ceil(totalUsers / parsedLimit) : 1,
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
