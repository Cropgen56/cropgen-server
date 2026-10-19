import {
  ADMIN_LEVEL_RANK,
  CROPGEN_PLATFORM_ROLES,
} from "../constants/adminLevels.js";
import { getHighestAdminLevel } from "../utils/adminScope.js";
import { loadBiodropsAssignmentsForUser } from "../utils/authPayload.js";

function enrichActor(user = {}) {
  const adminAssignments = user.adminAssignments || [];
  return {
    id: user.id || user._id,
    role: user.role,
    organization: user.organization,
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
    const adminAssignments = await loadBiodropsAssignmentsForUser(userId);
    const actorUser = { ...req.user, adminAssignments };
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
  const { minLevel = null, roles = ["admin", "developer", "staff"] } = options;
  const minRank = minLevel ? ADMIN_LEVEL_RANK[minLevel] || 0 : 0;

  return (req, res, next) => {
    const actor = req.biodropsAdminActor || enrichActor(req.user || {});
    req.biodropsAdminActor = actor;
    req.adminActor = actor;

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
