import BiodropsAdminAssignment from "../models/admin-assignment.model.js";
import CrmInvitation from "../models/crm-invitation.model.js";

const LEVEL_LABELS = {
  super: "SUPER ADMIN",
  country: "COUNTRY ADMIN",
  state: "STATE USER",
  district: "DISTRICT OPERATOR",
  ground: "FPO / AGENT",
};

/**
 * ACTIVE — logged in at least once
 * PENDING — email invitation not yet verified
 * VERIFIED — invitation accepted, awaiting first CRM login
 * DISABLED — assignment suspended
 */
export function deriveCrmUserStatus(user, assignment, invitation = null) {
  if (assignment?.status === "suspended") return "DISABLED";
  if (user?.lastLoginAt) return "ACTIVE";

  // Verified via email link (terms set on accept) or accepted invitation record
  if (invitation?.status === "accepted" || user?.terms === true) {
    return "VERIFIED";
  }

  const emailInvitePending =
    invitation?.status === "pending" &&
    invitation?.expiresAt &&
    new Date(invitation.expiresAt) > new Date();

  if (emailInvitePending) return "PENDING";

  return "PENDING";
}

export function crmStatusLabel(status) {
  if (status === "VERIFIED") return "AWAITING LOGIN";
  return status;
}

function formatLastActive(date) {
  if (!date) return "—";
  const d = new Date(date);
  const now = Date.now();
  const diffMs = now - d.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString();
}

export function formatCrmUser(user, assignment = null, invitation = null) {
  const name =
    [user.firstName, user.lastName].filter(Boolean).join(" ").trim() ||
    user.email ||
    user.phone ||
    "Unknown";

  const level = assignment?.level || null;
  const displayRole = level
    ? LEVEL_LABELS[level] || level.toUpperCase()
    : String(user.role || "staff").toUpperCase();

  const regionParts = [user.country, user.state].filter(Boolean);
  const territory = user.district || user.city || "—";
  const status = deriveCrmUserStatus(user, assignment, invitation);

  return {
    id: String(user._id),
    uid: `BD-${String(user._id).slice(-6).toUpperCase()}`,
    name,
    email: user.email || null,
    phone: user.phone || null,
    avatar: user.avatar || null,
    role: displayRole,
    region: regionParts.length ? regionParts.join(", ") : "—",
    territory,
    status,
    statusLabel: crmStatusLabel(status),
    invitationStatus: invitation?.status || null,
    active: formatLastActive(user.lastActiveAt || user.lastLoginAt),
    lastActive: user.lastActiveAt || user.lastLoginAt || null,
    assignmentLevel: level ? LEVEL_LABELS[level] : null,
    adminLevel: level || null,
    assignmentId: assignment?._id ? String(assignment._id) : null,
    assignmentStatus: assignment?.status || null,
    reportsTo: assignment?.appointedBy
      ? [assignment.appointedBy.firstName, assignment.appointedBy.lastName]
          .filter(Boolean)
          .join(" ")
          .trim() || assignment.appointedBy.email || "—"
      : "—",
    reportsToId: assignment?.appointedBy
      ? String(assignment.appointedBy._id || assignment.appointedBy)
      : null,
    country: user.country || null,
    state: user.state || null,
    district: user.district || null,
    createdAt: user.createdAt || null,
    terms: user.terms === true,
  };
}

export async function loadActiveAssignmentsByUserId(userIds) {
  if (!userIds?.length) return new Map();

  const rows = await BiodropsAdminAssignment.find({
    userId: { $in: userIds },
  })
    .populate("appointedBy", "firstName lastName email")
    .lean();

  const map = new Map();
  const rank = (level) =>
    ({ super: 5, country: 4, state: 3, district: 2, ground: 1 })[level] || 0;

  for (const row of rows) {
    const key = String(row.userId);
    const existing = map.get(key);
    if (row.status === "suspended") {
      if (!existing || existing.status !== "suspended" || rank(row.level) >= rank(existing.level)) {
        map.set(key, row);
      }
      continue;
    }
    if (existing?.status === "suspended") continue;
    if (!existing || rank(row.level) > rank(existing.level)) {
      map.set(key, row);
    }
  }
  return map;
}

export async function loadAllAssignmentsForUser(userId) {
  return BiodropsAdminAssignment.find({ userId })
    .sort({ createdAt: -1 })
    .populate("appointedBy", "firstName lastName email")
    .lean();
}

/** Latest CRM email invitation per user (any status). */
export async function loadLatestInvitationsByUserId(userIds, tenantId = null) {
  if (!userIds?.length) return new Map();

  const query = { userId: { $in: userIds } };
  if (tenantId) query.tenantId = tenantId;

  const rows = await CrmInvitation.find(query).sort({ createdAt: -1 }).lean();

  const map = new Map();
  for (const row of rows) {
    const key = String(row.userId);
    if (!map.has(key)) map.set(key, row);
  }
  return map;
}
