import User from "../../models/user.model.js";
import Organization from "../../models/organization.model.js";

/** Org codes that always get a scoped CropGen admin (own org data only). */
export const ORG_SCOPED_ADMIN_CODES = ["AAT"];

export function organizationIdOf(user) {
  const org = user?.organization;
  if (!org) return null;
  if (typeof org === "object" && org._id) return org._id;
  return org;
}

export function organizationCodeOf(user) {
  return String(
    user?.organization?.organizationCode || user?.organizationCode || "",
  )
    .trim()
    .toUpperCase();
}

const ADMIN_PANEL_ROLES = ["admin", "developer", "client", "staff"];

/** Client role, or a dedicated org such as AAT — never see global admin data. */
export function isOrgScopedAdmin(user) {
  if (!user || user.role === "farmer") return false;
  if (user.role === "client") return true;
  return (
    ORG_SCOPED_ADMIN_CODES.includes(organizationCodeOf(user)) &&
    ADMIN_PANEL_ROLES.includes(user.role)
  );
}

export function canAccessAdminPanel(user) {
  if (!user) return false;
  if (["admin", "developer", "client"].includes(user.role)) return true;
  return (
    ORG_SCOPED_ADMIN_CODES.includes(organizationCodeOf(user)) &&
    user.role === "staff"
  );
}

export function getOrgScopeId(user) {
  if (!isOrgScopedAdmin(user)) return null;
  return organizationIdOf(user);
}

export async function getOrgScopedUserIds(user) {
  const orgId = getOrgScopeId(user);
  if (!orgId) return null;
  const users = await User.find({ organization: orgId, deletedAt: null })
    .select("_id")
    .lean();
  return users.map((u) => u._id);
}

export function sameOrg(viewer, targetOrgId) {
  const scopeId = getOrgScopeId(viewer);
  if (!scopeId) return true;
  if (!targetOrgId) return false;
  return String(scopeId) === String(targetOrgId);
}

export function normalizeLoginEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function emailMatchQuery(email) {
  const normalized = normalizeLoginEmail(email);
  return {
    $or: [
      { email: normalized },
      { email: new RegExp(`^${escapeRegex(normalized)}$`, "i") },
    ],
  };
}

const ORG_POPULATE = {
  path: "organization",
  select: "organizationCode organizationName email",
};

export async function findOrganizationByEmail(email) {
  const normalized = normalizeLoginEmail(email);
  if (!normalized) return null;
  return Organization.findOne(emailMatchQuery(normalized));
}

/** Create or reuse a client user so the organization email can log into admin. */
export async function ensureOrganizationClientUser(org) {
  if (!org?._id) return null;
  const email = normalizeLoginEmail(org.email);
  if (!email) return null;

  let user = await User.findOne({
    ...emailMatchQuery(email),
    deletedAt: null,
  }).populate(ORG_POPULATE);

  if (user) {
    const sameOrg =
      String(organizationIdOf(user) || "") === String(org._id);
    if (!user.organization || sameOrg) {
      user.organization = org._id;
      if (user.role === "farmer") user.role = "client";
      if (!user.terms) user.terms = true;
      await user.save();
      await user.populate(ORG_POPULATE);
      return user;
    }
  }

  user = await User.create({
    email,
    role: "client",
    organization: org._id,
    terms: true,
    firstName: String(org.organizationName || "Organization").slice(0, 50),
    clientSource: "web",
  });
  return user.populate(ORG_POPULATE);
}

/** Resolve the account that may request/verify an admin-panel OTP. */
export async function findAdminLoginUser(rawEmail) {
  const email = normalizeLoginEmail(rawEmail);
  if (!email) return null;

  const users = await User.find({
    ...emailMatchQuery(email),
    deletedAt: null,
  }).populate(ORG_POPULATE);

  const privileged = users.find((u) => canAccessAdminPanel(u));
  if (privileged) return privileged;

  const org = await findOrganizationByEmail(email);
  if (org) {
    const orgClient = await ensureOrganizationClientUser(org);
    if (orgClient && canAccessAdminPanel(orgClient)) return orgClient;
  }

  return users[0] || null;
}
