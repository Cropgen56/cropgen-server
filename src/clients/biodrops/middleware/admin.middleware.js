import {
  ADMIN_LEVEL_RANK,
  CROPGEN_PLATFORM_ROLES,
} from "../constants/adminLevels.js";
import { getHighestAdminLevel } from "../utils/adminScope.js";
import { loadBiodropsAssignmentsForUser } from "../utils/authPayload.js";
import { isClientViewer } from "../utils/clientOrg.js";
import User from "../../../models/user.model.js";

function enrichActor(user = {}) {
  const adminAssignments = user.adminAssignments || [];
  return {
    id: user.id || user._id,
    role: user.role,
    organization: user.organization,
    clientOrganization: user.clientOrganization || null,
    adminAssignments,
    highestAdminLevel: getHighestAdminLevel(adminAssignments),
    isCropgenPlatformAdmin: CROPGEN_PLATFORM_ROLES.has(user.role),
  };
}

/** Load active admin assignments from DB — JWT copies go stale after role changes. */
export async function attachBiodropsAdminActor(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ success: false, message: "Unauthorized" });
  }

  try {
    const userId = req.user.id || req.user._id;
    const [adminAssignments, dbUser] = await Promise.all([
      loadBiodropsAssignmentsForUser(userId),
      User.findOne({ _id: userId, deletedAt: null })
        .select("role clientOrganization")
        .populate("clientOrganization", "status")
        .lean(),
    ]);
    if (!dbUser) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }
    const clientOrg = dbUser.clientOrganization || null;
    const actorUser = {
      ...req.user,
      role: dbUser.role,
      clientOrganization: clientOrg?._id || null,
      adminAssignments,
    };
    if (isClientViewer(actorUser) && clientOrg?.status === "inactive") {
      return res.status(403).json({
        success: false,
        message: "This client organization has been deactivated.",
      });
    }
    req.biodropsAdminActor = enrichActor(actorUser);
    req.adminActor = req.biodropsAdminActor;
    next();
  } catch (err) {
    console.error("attachBiodropsAdminActor:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to resolve admin permissions.",
    });
  }
}

export function requireBiodropsAdminAccess(options = {}) {
  const {
    minLevel = null,
    roles = ["admin", "developer", "staff"],
    // Client viewers (read-only client logins) are denied unless a route opts in.
    allowClientViewer = false,
  } = options;
  const minRank = minLevel ? ADMIN_LEVEL_RANK[minLevel] || 0 : 0;

  return (req, res, next) => {
    const actor = req.biodropsAdminActor || enrichActor(req.user || {});
    req.biodropsAdminActor = actor;
    req.adminActor = actor;

    if (isClientViewer(actor)) {
      if (allowClientViewer) return next();
      return res.status(403).json({
        success: false,
        message: "Access denied. Client accounts have read-only access.",
      });
    }

    if (actor.isCropgenPlatformAdmin && roles.includes(actor.role)) {
      return next();
    }

    if (roles.includes(actor.role) && !minLevel) {
      const highestRank = ADMIN_LEVEL_RANK[actor.highestAdminLevel] || 0;
      if (highestRank > 0) return next();
    }

    const highestRank = ADMIN_LEVEL_RANK[actor.highestAdminLevel] || 0;
    if (highestRank >= minRank && highestRank > 0) {
      return next();
    }

    return res.status(403).json({
      success: false,
      message: "Access denied. Insufficient BioDrops admin privileges.",
    });
  };
}
