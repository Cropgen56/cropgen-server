import User from "../../../../models/user.model.js";
import CrmInvitation from "../../models/crm-invitation.model.js";
import { resolveCrmUserBaseQuery } from "../../utils/crmUserQuery.js";
import { formatCrmUser, loadActiveAssignmentsByUserId } from "../../utils/crmUserFormat.js";

export const listPendingCrmInvitations = async (req, res) => {
  try {
    const { org } = await resolveCrmUserBaseQuery(req);

    const pendingInvites = await CrmInvitation.find({
      tenantId: org._id,
      status: "pending",
      expiresAt: { $gt: new Date() },
    })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    const userIds = pendingInvites.map((i) => i.userId);
    const users = await User.find({ _id: { $in: userIds } })
      .select("-password -otp -__v")
      .lean();

    const userById = new Map(users.map((u) => [String(u._id), u]));
    const map = await loadActiveAssignmentsByUserId(userIds);

    const pending = pendingInvites
      .map((inv) => {
        const user = userById.get(String(inv.userId));
        if (!user) return null;
        const formatted = formatCrmUser(user, map.get(String(user._id)) || null);
        return {
          ...formatted,
          invitationId: String(inv._id),
          invitationEmail: inv.email,
          invitationExpiresAt: inv.expiresAt,
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
