import {
  ADMIN_LEVEL_RANK,
  CROPGEN_PLATFORM_ROLES,
} from "../constants/adminLevels.js";
import { getHighestAdminLevel } from "../utils/adminScope.js";

function enrichActor(req) {
  const user = req.user || {};
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

export function attachBiodropsAdminActor(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ success: false, message: "Unauthorized" });
  }
  req.biodropsAdminActor = enrichActor(req);
  req.adminActor = req.biodropsAdminActor;
  next();
}

export function requireBiodropsAdminAccess(options = {}) {
  const { minLevel = null, roles = ["admin", "developer", "staff"] } = options;
  const minRank = minLevel ? ADMIN_LEVEL_RANK[minLevel] || 0 : 0;

  return (req, res, next) => {
    const actor = enrichActor(req);
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
