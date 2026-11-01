import User from "../../../../models/user.model.js";
import CrmInvitation from "../../models/crm-invitation.model.js";
import { resolveCrmUserBaseQuery } from "../../utils/crmUserQuery.js";
import { formatCrmUser, loadActiveAssignmentsByUserId } from "../../utils/crmUserFormat.js";
import BiodropsAdminAssignment from "../../models/admin-assignment.model.js";

/**
 * Open email invitations (pending or expired, not yet accepted) for people
 * still on the CRM team. Shared by the Pending Invitations page and the
 * "Pending" badge on the team page so the two always agree.
 */
export async function loadOpenInvitations(orgId, { limit = 100 } = {}) {
  // Expired invites stay listed (flagged) so they can be resent — the
  // resend endpoint accepts both, and this is the only place to resend.
  const invites = await CrmInvitation.find({
    tenantId: orgId,
    status: { $in: ["pending", "expired"] },
  })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();

  const userIds = invites.map((i) => i.userId);
  const [users, onTeam] = await Promise.all([
    // Someone who already signs in (e.g. via WhatsApp OTP without clicking
    // the email link) has nothing pending, even if their invite is still open.
    User.find({ _id: { $in: userIds }, deletedAt: null, lastLoginAt: null })
      .select("-password -otp -__v")
      .lean(),
    BiodropsAdminAssignment.distinct("userId", { userId: { $in: userIds }, tenantId: orgId }),
  ]);
  const teamIds = new Set(onTeam.map(String));
  const userById = new Map(
    users.filter((u) => teamIds.has(String(u._id))).map((u) => [String(u._id), u]),
  );
  // One row per person (newest invitation wins).
  const seen = new Set();
  const rows = [];
  for (const inv of invites) {
    const key = String(inv.userId);
    if (!userById.has(key) || seen.has(key)) continue;
    seen.add(key);
    rows.push({ invitation: inv, user: userById.get(key) });
  }
  return rows;
}

export const listPendingCrmInvitations = async (req, res) => {
  try {
    const { org } = await resolveCrmUserBaseQuery(req);

    const rows = await loadOpenInvitations(org._id);
    const userIds = rows.map((r) => r.user._id);
    const map = await loadActiveAssignmentsByUserId(userIds);

    const pending = rows
      .map(({ invitation: inv, user }) => {
        const formatted = formatCrmUser(user, map.get(String(user._id)) || null);
        return {
          ...formatted,
          invitationId: String(inv._id),
          // Resend goes to the user's current email, so show that one.
          invitationEmail: user.email || inv.email,
          invitationExpiresAt: inv.expiresAt,
          expired: inv.status === "expired" || new Date(inv.expiresAt) <= new Date(),
          emailSentAt: inv.emailSentAt,
        };
      })
      .filter(Boolean);

    return res.status(200).json({
      success: true,
      users: pending,
      total: pending.length,
    });
  } catch (error) {
    const status = error.status || 500;
    if (status >= 500) console.error("listPendingCrmInvitations:", error);
    return res.status(status).json({
      success: false,
      message: error.message || "Failed to load pending invitations.",
    });
  }
};
