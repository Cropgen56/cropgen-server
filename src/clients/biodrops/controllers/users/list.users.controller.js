import User from "../../../../models/user.model.js";
import { ORGANIZATION_CODE } from "../../constants.js";
import { buildUserScopeFilter } from "../../utils/adminScope.js";
import { CROPGEN_PLATFORM_ROLES } from "../../constants/adminLevels.js";
import { resolveOrganizationByCode } from "../../../../utils/auth/authUtils.js";

export const listBiodropsUsers = async (req, res) => {
  try {
    const { role, adminAssignments = [] } = req.user;
    const { page = 1, limit = 10, all = "false" } = req.query;

    const isCropgenOps = CROPGEN_PLATFORM_ROLES.has(role);
    const isGeoStaff =
      role === "staff" &&
      Array.isArray(adminAssignments) &&
      adminAssignments.length > 0;

    if (!isCropgenOps && !isGeoStaff) {
      return res.status(403).json({
        success: false,
        message: "Access denied. BioDrops CRM admin access required.",
      });
    }

    const { org } = await resolveOrganizationByCode(ORGANIZATION_CODE);

    let baseQuery = { organization: org._id };

    if (isGeoStaff) {
      const scopeFilter = buildUserScopeFilter(adminAssignments);
      baseQuery = { ...baseQuery, ...scopeFilter };
    } else if (role === "staff" && !isGeoStaff) {
      return res.status(403).json({
        success: false,
        message: "Staff account has no active BioDrops admin assignment.",
      });
    }

    const wantsAll = String(all).toLowerCase() === "true";
    if (wantsAll && !isCropgenOps) {
      return res.status(403).json({
        success: false,
        message: "Only CropGen platform admins can fetch all users at once.",
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

    if (!users?.length) {
      return res.status(200).json({
        success: true,
        message: "No users found.",
        users: [],
        pagination: wantsAll
          ? { returned: 0, totalUsers: 0 }
          : {
              currentPage: parsedPage,
              totalPages: 1,
              totalUsers: 0,
              limit: parsedLimit,
            },
      });
    }

    return res.status(200).json({
      success: true,
      message: "BioDrops users fetched successfully.",
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
    console.error("listBiodropsUsers:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch users.",
      error: error.message,
    });
  }
};
