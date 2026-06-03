import User from "../../../models/user.model.js";
import BiodropsAdminAssignment from "../models/admin-assignment.model.js";
import {
  resolveCrmUserBaseQuery,
  buildCrmTeamUserQuery,
} from "./crmUserQuery.js";
import {
  canManageAssignment,
  serializeAssignment,
  validateAssignmentFields,
} from "./adminScope.js";

const LEVEL_RANK = { super: 5, country: 4, state: 3, district: 2, ground: 1 };

export function splitFullName(fullName) {
  const parts = String(fullName || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return { firstName: "User", lastName: "" };
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

export function normalizeCrmPhone(phone) {
  if (!phone) return null;
  const raw = String(phone).trim();
  if (raw.startsWith("+")) return raw;
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length === 10) return `+91${digits}`;
  return `+${digits}`;
}

function pickPrimaryAssignment(assignments = []) {
  let best = null;
  let bestRank = -1;
  for (const a of assignments) {
    const rank = LEVEL_RANK[a.level] || 0;
    const statusBoost = a.status === "active" ? 10 : 0;
    const score = rank + statusBoost;
    if (score > bestRank) {
      bestRank = score;
      best = a;
    }
  }
  return best;
}

export async function loadCrmTeamUserForManage(req, userId) {
  const { baseQuery, org } = await resolveCrmUserBaseQuery(req);
  const teamQuery = await buildCrmTeamUserQuery(baseQuery, org._id);

  const user = await User.findOne({
    _id: userId,
    ...teamQuery,
  });

  if (!user) {
    const err = new Error("User not found in your CRM scope.");
    err.status = 404;
    throw err;
  }

  const assignments = await BiodropsAdminAssignment.find({
    userId: user._id,
    tenantId: org._id,
  }).sort({ createdAt: -1 });

  const primaryAssignment = pickPrimaryAssignment(assignments);

  if (!primaryAssignment) {
    const err = new Error("User has no admin assignment in this organization.");
    err.status = 404;
    throw err;
  }

  return { user, org, assignments, primaryAssignment };
}

export function assertCanManageCrmUser(actor, assignment, targetUserId) {
  if (!assignment) {
    const err = new Error("No admin assignment to manage.");
    err.status = 404;
    throw err;
  }

  if (String(actor?.id) === String(targetUserId)) {
    const err = new Error("You cannot perform this action on your own account.");
    err.status = 400;
    throw err;
  }

  if (!canManageAssignment(actor, serializeAssignment(assignment))) {
    const err = new Error("You do not have permission to manage this user.");
    err.status = 403;
    throw err;
  }
}

export async function assertNotLastSuperAdmin(tenantId, assignment) {
  if (assignment.level !== "super" || assignment.status !== "active") return;

  const count = await BiodropsAdminAssignment.countDocuments({
    tenantId,
    level: "super",
    status: "active",
  });

  if (count <= 1) {
    const err = new Error(
      "Cannot remove or suspend the last active Super Admin for this organization.",
    );
    err.status = 400;
    throw err;
  }
}

export function buildGeoForLevel(level, { countryCode, stateCode, districtCode }) {
  return {
    countryCode: level === "super" ? null : countryCode || null,
    stateCode:
      level === "super" || level === "country" ? null : stateCode || null,
    districtCode:
      level === "super" || level === "country" || level === "state"
        ? null
        : districtCode || null,
  };
}

export function validateLevelGeo(level, tenantId, geo) {
  return validateAssignmentFields(level, {
    tenantId,
    countryCode: geo.countryCode,
    stateCode: geo.stateCode,
    districtCode: geo.districtCode,
    managedOrganizationId: null,
  });
}
