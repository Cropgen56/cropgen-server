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

/**
 * Global CropGen admin/developer: any user.
 * AAT/client org-scoped admin: only farmers in the same organization.
 */
export async function assertCanManageTargetUser(viewer, userId) {
  if (!canAccessAdminPanel(viewer)) {
    return { ok: false, status: 403, message: "Access denied." };
  }
  if (!isOrgScopedAdmin(viewer)) return { ok: true };
  if (!userId) {
    return { ok: false, status: 400, message: "User is required." };
  }
  const target = await User.findById(userId).select("organization").lean();
  if (!target) {
    return { ok: false, status: 404, message: "User not found." };
  }
  if (!sameOrg(viewer, target.organization)) {
    return {
      ok: false,
      status: 403,
      message: "You can only manage users in your organization.",
    };
  }
  return { ok: true };
}

export function normalizeLoginEmail(email) {
  return String(email || "").trim().toLowerCase();
}

export const DEFAULT_ORG_CODE = "CROPGEN";

/** Orgs with their own app — their accounts never show up in another app. */
const SEPARATE_APP_ORG_CODES = ["BIODROPS"];

/** Org an app declares via the X-Organization-Code header, or null. */
export function headerOrgCode(req) {
  return (
    String(req?.headers?.["x-organization-code"] || "")
      .trim()
      .toUpperCase() || null
  );
}

/**
 * Org the calling app belongs to: X-Organization-Code, else BIODROPS for the
 * BioDrops brand, else null (a CropGen-side app that does not send its org).
 */
export function requestOrgCode(req) {
  const brand = String(
    req?.headers?.["x-client-brand"] || req?.body?.clientBrand || "",
  ).toLowerCase();
  return headerOrgCode(req) || (brand === "biodrops" ? "BIODROPS" : null);
}

/**
 * Email is unique per organization, not globally: the same address may hold
 * one account in every org. Merge this into a user lookup by email.
 * - Known org: only that org's accounts. CROPGEN also owns orgless signup
 *   placeholders (OTP signup before onboarding picks the org).
 * - null: legacy CropGen-side app — any org except the separate-app ones.
 */
export async function emailScopeFilter(orgCode) {
  if (orgCode) {
    const org = await Organization.findOne({ organizationCode: orgCode })
      .select("_id")
      .lean();
    if (!org) return { _id: null }; // unknown org owns no accounts
    return orgCode === DEFAULT_ORG_CODE
      ? { organization: { $in: [org._id, null] } }
      : { organization: org._id };
  }
  const separate = await Organization.find({
    organizationCode: { $in: SEPARATE_APP_ORG_CODES },
  })
    .select("_id")
    .lean();
  return { organization: { $nin: separate.map((o) => o._id) } };
}

/** Phone, like email, is unique per organization — same scoping rules. */
export const phoneScopeFilter = emailScopeFilter;

/**
 * The account for `email` that `orgCode`'s app should see (organization
 * populated). Without an org several accounts can match, so prefer active,
 * then CROPGEN / orgless, then the oldest.
 */
export function findUserByEmail(email, orgCode, extra = {}) {
  return findUserInOrg({ email: normalizeLoginEmail(email) }, orgCode, extra);
}

/** Same as findUserByEmail, matched on the E.164 phone number. */
export function findUserByPhone(phone, orgCode, extra = {}) {
  return findUserInOrg({ phone }, orgCode, extra);
}

/**
 * The account in `orgCode`'s scope whose OTP for this phone was sent last —
 * the one verify/resend must act on when several orgs share the number.
 */
export async function findLatestOtpUserByPhone(phone, orgCode) {
  const [user] = await User.find({
    phone,
    deletedAt: null,
    otp: { $ne: null },
    ...(await phoneScopeFilter(orgCode)),
  })
    .sort({ lastOtpSentAt: -1 })
    .limit(1)
    .populate("organization");
  return user || null;
}

async function findUserInOrg(match, orgCode, extra) {
  const users = await User.find({
    ...match,
    ...extra,
    ...(await emailScopeFilter(orgCode)),
  })
    .sort({ createdAt: 1 })
    .populate("organization");
  const rank = (u) =>
    (u.deletedAt ? 2 : 0) +
    (!u.organization ||
    u.organization.organizationCode === DEFAULT_ORG_CODE
      ? 0
      : 1);
  return users.sort((a, b) => rank(a) - rank(b))[0] || null;
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

/**
 * Soft-delete an organization's old client login and free its email, so a
 * Google / OTP lookup by that email can't land on the deleted row.
 */
async function retireOrganizationClientUser(user) {
  await User.updateOne(
    { _id: user._id },
    {
      $set: {
        deletedAt: new Date(),
        emailBeforeDelete: user.email,
        refreshTokenId: null,
      },
      $unset: { email: "", refreshTokenIds: "" },
    },
    { strict: false },
  );
}

/**
 * Create or reuse a client user so the organization email can log into admin.
 *
 * `previousEmail` is the organization's email before an update: its client
 * login is moved to the new email (or retired, when the new email already has
 * its own account) instead of being left behind as an extra client.
 */
export async function ensureOrganizationClientUser(org, { previousEmail } = {}) {
  if (!org?._id) return null;
  const email = normalizeLoginEmail(org.email);
  if (!email) return null;

  const oldEmail = normalizeLoginEmail(previousEmail);
  const previousClient =
    oldEmail && oldEmail !== email
      ? await User.findOne({
          ...emailMatchQuery(oldEmail),
          role: "client",
          organization: org._id,
          deletedAt: null,
        })
      : null;

  // Only this org's account (or an orgless one) — the same email may own
  // accounts in other orgs, which stay untouched.
  let user = await User.findOne({
    ...emailMatchQuery(email),
    deletedAt: null,
    organization: { $in: [org._id, null] },
  }).populate(ORG_POPULATE);

  if (user) {
    const sameOrg =
      String(organizationIdOf(user) || "") === String(org._id);
    if (!user.organization || sameOrg) {
      user.organization = org._id;
      if (user.role === "farmer") user.role = "client";
      if (!user.terms) user.terms = true;
      await user.save();
      if (previousClient) await retireOrganizationClientUser(previousClient);
      await user.populate(ORG_POPULATE);
      return user;
    }
  }

  if (previousClient && !user) {
    previousClient.email = email;
    await previousClient.save();
    return previousClient.populate(ORG_POPULATE);
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

/**
 * Resolve the account that may request/verify an admin-panel OTP. An org's
 * own panel passes its `orgCode`; without one any org's admin may match.
 */
export async function findAdminLoginUser(rawEmail, orgCode = null) {
  const email = normalizeLoginEmail(rawEmail);
  if (!email) return null;

  const users = await User.find({
    ...emailMatchQuery(email),
    deletedAt: null,
    ...(orgCode ? await emailScopeFilter(orgCode) : {}),
  }).populate(ORG_POPULATE);

  const privileged = users.find((u) => canAccessAdminPanel(u));
  if (privileged) return privileged;

  const org = await findOrganizationByEmail(email);
  if (org && (!orgCode || org.organizationCode === orgCode)) {
    const orgClient = await ensureOrganizationClientUser(org);
    if (orgClient && canAccessAdminPanel(orgClient)) return orgClient;
  }

  return users[0] || null;
}
