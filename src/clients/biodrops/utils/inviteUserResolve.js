import User from "../../../models/user.model.js";
import BiodropsAdminAssignment from "../models/admin-assignment.model.js";
import CrmInvitation from "../models/crm-invitation.model.js";

export function normalizeInvitePhone(phone) {
  if (!phone) return null;
  const raw = String(phone).trim();
  if (raw.startsWith("+")) return raw;
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length === 10) return `+91${digits}`;
  return `+${digits}`;
}

export async function resolveInviteUser({
  normalizedPhone,
  normalizedEmail,
  tenantId,
}) {
  const userByPhone = normalizedPhone
    ? await User.findOne({ phone: normalizedPhone })
    : null;
  const userByEmail = normalizedEmail
    ? await User.findOne({ email: normalizedEmail })
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
