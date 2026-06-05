import User from "../../../models/user.model.js";
import BiodropsAdminAssignment from "../models/admin-assignment.model.js";
import { validateAssignmentFields } from "./adminScope.js";

const UNIQUE_ASSIGNMENT_LEVELS = new Set([
  "super",
  "country",
  "state",
  "district",
]);

const LEVEL_LABELS = {
  super: "Super Admin",
  country: "Country Admin",
  state: "State Admin",
  district: "District Admin",
  ground: "FPO / Agent",
};

function formatAssigneeName(user) {
  if (!user) return "another user";
  const name = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  return name || user.email || user.phone || "another user";
}

function buildScopeLabel(level, { countryCode, stateCode, districtCode }) {
  if (level === "super") return "this organization";
  if (level === "country") return countryCode || "this country";
  if (level === "state") {
    return [stateCode, countryCode].filter(Boolean).join(", ") || "this state";
  }
  if (level === "district") {
    return [districtCode, stateCode, countryCode].filter(Boolean).join(", ") ||
      "this district";
  }
  return "this scope";
}

export function buildActiveAssignmentScopeQuery(
  level,
  { tenantId, countryCode, stateCode, districtCode },
) {
  const query = {
    tenantId,
    level,
    status: "active",
  };

  if (level === "super") return query;

  if (countryCode) query.countryCode = countryCode;
  if (level === "state" || level === "district" || level === "ground") {
    if (stateCode) query.stateCode = stateCode;
  }
  if (level === "district" || level === "ground") {
    if (districtCode) query.districtCode = districtCode;
  }

  return query;
}

export async function checkAssignmentAvailability({
  level,
  tenantId,
  countryCode = null,
  stateCode = null,
  districtCode = null,
  excludeUserId = null,
}) {
  if (!level) {
    return {
      available: false,
      canAssign: false,
      message: "Admin level is required.",
    };
  }

  if (!UNIQUE_ASSIGNMENT_LEVELS.has(level)) {
    return {
      available: true,
      canAssign: true,
      message: "Multiple agents can be assigned in the same district.",
    };
  }

  const fieldCheck = validateAssignmentFields(level, {
    tenantId,
    countryCode,
    stateCode,
    districtCode,
    managedOrganizationId: null,
  });

  if (!fieldCheck.ok) {
    return {
      available: false,
      canAssign: false,
      message: fieldCheck.message,
    };
  }

  const scopeQuery = buildActiveAssignmentScopeQuery(level, {
    tenantId,
    countryCode: fieldCheck.countryCode,
    stateCode: fieldCheck.stateCode,
    districtCode: fieldCheck.districtCode,
  });

  if (excludeUserId) {
    scopeQuery.userId = { $ne: excludeUserId };
  }

  const existing = await BiodropsAdminAssignment.findOne(scopeQuery).lean();

  if (!existing) {
    return {
      available: true,
      canAssign: true,
      message: `${LEVEL_LABELS[level]} slot is available for ${buildScopeLabel(level, fieldCheck)}.`,
    };
  }

  const assignee = await User.findById(existing.userId)
    .select("firstName lastName email phone")
    .lean();

  const scopeLabel = buildScopeLabel(level, fieldCheck);
  const assigneeName = formatAssigneeName(assignee);

  return {
    available: false,
    canAssign: false,
    message: `${LEVEL_LABELS[level]} is already assigned to ${assigneeName} for ${scopeLabel}.`,
    assignedUser: assignee
      ? {
          id: String(assignee._id),
          name: assigneeName,
          email: assignee.email || null,
          phone: assignee.phone || null,
        }
      : null,
    assignmentId: String(existing._id),
  };
}
