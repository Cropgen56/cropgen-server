import User from "../../../models/user.model.js";
import BiodropsAdminAssignment from "../models/admin-assignment.model.js";
import CrmInvitation from "../models/crm-invitation.model.js";
import Organization from "../../../models/organization.model.js";
import { isClientLoginAccount } from "./clientOrg.js";

export function normalizeInvitePhone(phone) {
  if (!phone) return null;
  const raw = String(phone).trim();
  if (raw.startsWith("+")) return raw;
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length === 10) return `+91${digits}`;
  return `+${digits}`;
}

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Case-insensitive exact email match (some accounts were stored mixed-case). */
export function emailMatchQuery(normalizedEmail) {
  return { $regex: `^${escapeRegex(normalizedEmail)}$`, $options: "i" };
}

/** Same mobile stored as "+91XXXXXXXXXX" or bare "XXXXXXXXXX". */
export function phoneMatchQuery(normalizedPhone) {
  const variants = new Set([normalizedPhone]);
  const local = normalizedPhone.replace(/^\+91/, "");
  if (/^\d{10}$/.test(local)) {
    variants.add(local);
    variants.add(`91${local}`);
  }
  return { $in: [...variants] };
}

export async function resolveInviteUser({
  normalizedPhone,
  normalizedEmail,
  tenantId,
}) {
  // Email and phone are unique per org: an account in another org is a
  // separate account and must not be reused or block the invite.
  const userByPhone = normalizedPhone
    ? await User.findOne({
        phone: phoneMatchQuery(normalizedPhone),
        organization: tenantId,
        deletedAt: null,
      })
    : null;
  const userByEmail = normalizedEmail
    ? await User.findOne({
        email: emailMatchQuery(normalizedEmail),
        organization: tenantId,
        deletedAt: null,
      })
    : null;

  if (
    userByPhone &&
    userByEmail &&
    String(userByPhone._id) !== String(userByEmail._id)
  ) {
    return {
      error: {
        status: 409,
        reason: "account_conflict",
        message:
          "This email and mobile number belong to different accounts. Use matching credentials or contact support.",
      },
    };
  }

  const user = userByPhone || userByEmail || null;
  if (!user) return { user: null };

  const userOrgId = user.organization?._id || user.organization || null;
  if (userOrgId && String(userOrgId) !== String(tenantId)) {
    return {
      error: {
        status: 409,
        reason: "different_organization",
        message:
          "This phone or email is linked to another organization. Access cannot be granted in this CRM.",
      },
    };
  }

  if (isClientLoginAccount(user)) {
    const client = await Organization.findById(user.clientOrganization)
      .select("organizationName")
      .lean();
    const name = client?.organizationName;
    return {
      error: {
        status: 409,
        reason: "client_account",
        message: `This email or phone is the CRM login of client ${name ? `"${name}"` : "organization"}. Client accounts can't be made CRM staff — use a different email and mobile number.`,
      },
    };
  }

  const activeAssignment = await BiodropsAdminAssignment.findOne({
    userId: user._id,
    tenantId,
    status: "active",
  }).lean();

  if (activeAssignment) {
    return {
      error: {
        status: 409,
        reason: "already_crm",
        message:
          "This user is already registered in CRM. Update their profile or resend the invitation from user management.",
      },
    };
  }

  const pendingInvitation = await CrmInvitation.findOne({
    userId: user._id,
    tenantId,
    status: "pending",
    expiresAt: { $gt: new Date() },
  }).lean();

  if (pendingInvitation) {
    return {
      error: {
        status: 409,
        reason: "pending_invite",
        message:
          "An invitation is already pending for this user. Use resend invitation instead.",
      },
    };
  }

  return { user };
}
