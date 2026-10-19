import User from "../../../models/user.model.js";
import BiodropsAdminAssignment from "../models/admin-assignment.model.js";
import { ORGANIZATION_CODE } from "../constants.js";
import {
  buildUserScopeFilter,
  canManageUserAssignment,
} from "./adminScope.js";
import { CROPGEN_PLATFORM_ROLES } from "../constants/adminLevels.js";
import { resolveOrganizationByCode } from "../../../utils/auth/authUtils.js";
import {
  formatCrmUser,
  deriveCrmUserStatus,
  loadLatestInvitationsByUserId,
} from "./crmUserFormat.js";

export async function resolveCrmUserBaseQuery(req) {
  const actor = req.adminActor || req.user || {};
  const { role } = actor;
  const adminAssignments =
    actor.adminAssignments || req.user?.adminAssignments || [];
  const isCropgenOps = CROPGEN_PLATFORM_ROLES.has(role);
  const isGeoStaff =
    role === "staff" &&
    Array.isArray(adminAssignments) &&
    adminAssignments.length > 0;

  if (!isCropgenOps && !isGeoStaff) {
    const err = new Error(
      "Access denied. BioDrops CRM admin access required.",
    );
    err.status = 403;
    throw err;
  }

  const { org } = await resolveOrganizationByCode(ORGANIZATION_CODE);
  let baseQuery = { organization: org._id };

  if (isGeoStaff) {
    baseQuery = { ...baseQuery, ...buildUserScopeFilter(adminAssignments) };
  } else if (role === "staff" && !isGeoStaff) {
    const err = new Error(
      "Staff account has no active BioDrops admin assignment.",
    );
    err.status = 403;
    throw err;
  }

  return { baseQuery, org };
}

/** Users with at least one admin assignment in this tenant (CRM team). */
export async function buildCrmTeamUserQuery(baseQuery, orgId) {
  const tenantAssignments = await BiodropsAdminAssignment.find({
    tenantId: orgId,
  })
    .select("userId")
    .lean();

  const userIds = [...new Set(tenantAssignments.map((a) => String(a.userId)))];
  if (!userIds.length) {
    return { ...baseQuery, _id: { $in: [] } };
  }

  return {
    ...baseQuery,
    _id: { $in: userIds },
  };
}

/** Single-user lookup — teamQuery's `$in` must not overwrite the requested id. */
export function buildCrmTeamUserByIdQuery(teamQuery, userId) {
  return {
    ...teamQuery,
    _id: userId,
  };
}

function buildSearchFilter(search) {
  if (!search?.trim()) return null;
  const q = search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return {
    $or: [
      { firstName: { $regex: q, $options: "i" } },
      { lastName: { $regex: q, $options: "i" } },
      { email: { $regex: q, $options: "i" } },
      { phone: { $regex: q, $options: "i" } },
    ],
  };
}

export async function fetchCrmScopedUsers({
  baseQuery,
  org,
  page,
  limit,
  status,
  search,
  actor = null,
}) {
  const parsedLimit = Math.max(1, Math.min(100, parseInt(limit, 10) || 20));
  const parsedPage = Math.max(1, parseInt(page, 10) || 1);
  const skip = (parsedPage - 1) * parsedLimit;

  let query = await buildCrmTeamUserQuery(baseQuery, org._id);
  const searchFilter = buildSearchFilter(search);
  if (searchFilter) {
    query = { $and: [query, searchFilter] };
  }

  const allUsers = await User.find(query)
    .sort({ createdAt: -1 })
    .select("-password -otp -__v")
    .lean();

  const userIds = allUsers.map((u) => u._id);
  const assignments = await BiodropsAdminAssignment.find({
    userId: { $in: userIds },
  })
    .populate("appointedBy", "firstName lastName email")
    .lean();

  const assignmentByUser = new Map();
  const rank = (level) =>
    ({ super: 5, country: 4, state: 3, district: 2, ground: 1 })[level] || 0;

  for (const row of assignments) {
    const key = String(row.userId);
    const prev = assignmentByUser.get(key);
    if (row.status === "suspended") {
      if (!prev || prev.status !== "suspended" || rank(row.level) >= rank(prev.level)) {
        assignmentByUser.set(key, row);
      }
      continue;
    }
    if (prev?.status === "suspended") continue;
    if (!prev || rank(row.level) > rank(prev.level)) {
      assignmentByUser.set(key, row);
    }
  }

  const invitationByUser = await loadLatestInvitationsByUserId(
    userIds,
    org._id,
  );

  let formatted = allUsers.map((user) => {
    const key = String(user._id);
    const assignment = assignmentByUser.get(key) || null;
    const row = formatCrmUser(
      user,
      assignment,
      invitationByUser.get(key) || null,
    );
    if (actor) {
      row.canManage = canManageUserAssignment(actor, assignment, org._id);
    }
    return row;
  });

  if (status && status !== "all") {
    const needle = String(status).toUpperCase();
    formatted = formatted.filter((u) => u.status === needle);
  }

  const totalUsers = formatted.length;
  const pageUsers = formatted.slice(skip, skip + parsedLimit);

  return {
    users: pageUsers,
    pagination: {
      page: parsedPage,
      currentPage: parsedPage,
      totalPages: Math.max(1, Math.ceil(totalUsers / parsedLimit)),
      totalUsers,
      total: totalUsers,
      limit: parsedLimit,
    },
  };
}

export async function computeCrmUserStats(baseQuery, org) {
  const query = await buildCrmTeamUserQuery(baseQuery, org._id);

  const users = await User.find(query)
    .select("terms lastLoginAt role country state district")
    .lean();

  const userIds = users.map((u) => u._id);
  const assignments = await BiodropsAdminAssignment.find({
    userId: { $in: userIds },
  })
    .select("userId level status")
    .lean();

  const assignmentByUser = new Map();
  const rank = (level) =>
    ({ super: 5, country: 4, state: 3, district: 2, ground: 1 })[level] || 0;

  for (const row of assignments) {
    const key = String(row.userId);
    const prev = assignmentByUser.get(key);
    if (row.status === "suspended") {
      if (!prev || prev.status !== "suspended" || rank(row.level) >= rank(prev.level)) {
        assignmentByUser.set(key, row);
      }
      continue;
    }
    if (prev?.status === "suspended") continue;
    if (!prev || rank(row.level) > rank(prev.level)) {
      assignmentByUser.set(key, row);
    }
  }

  const invitationByUser = await loadLatestInvitationsByUserId(
    userIds,
    org._id,
  );

  let active = 0;
  let pending = 0;
  let awaitingLogin = 0;
  let disabled = 0;

  for (const user of users) {
    const key = String(user._id);
    const assignment = assignmentByUser.get(key) || null;
    const invitation = invitationByUser.get(key) || null;
    const st = deriveCrmUserStatus(user, assignment, invitation);
    if (st === "ACTIVE") active += 1;
    else if (st === "DISABLED") disabled += 1;
    else if (st === "VERIFIED") awaitingLogin += 1;
    else if (st === "PENDING") pending += 1;
  }

  const countryAdmins = assignments.filter((a) => a.level === "country").length;
  const districtOperators = assignments.filter(
    (a) => a.level === "district" || a.level === "ground",
  ).length;

  return {
    totalUsers: users.length,
    active,
    pending,
    awaitingLogin,
    disabled,
    countryAdmins,
    districtOperators,
  };
}
