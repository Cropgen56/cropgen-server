import User from "../../../../models/user.model.js";
import CrmInvitation from "../../models/crm-invitation.model.js";
import {
  generateInvitationToken,
  getCrmAppBaseUrl,
} from "../../utils/invitationToken.js";
import { sendCrmInvitationEmail } from "../../services/crmInvitationEmail.service.js";
import { resolveCrmUserBaseQuery } from "../../utils/crmUserQuery.js";

const INVITE_EXPIRY_DAYS = 7;

export const resendCrmInvitation = async (req, res) => {
  try {
    await resolveCrmUserBaseQuery(req);

    const { userId } = req.params;
    const invitation = await CrmInvitation.findOne({
      userId,
      status: { $in: ["pending", "expired"] },
    }).sort({ createdAt: -1 });

    if (!invitation) {
      return res.status(404).json({
        success: false,
        message: "No pending invitation found for this user.",
      });
    }

    const user = await User.findById(userId).select("firstName lastName email phone");
    if (!user?.email) {
      return res.status(400).json({
        success: false,
        message: "User has no email address for invitation delivery.",
      });
    }

    const { token, tokenHash } = generateInvitationToken();
    invitation.tokenHash = tokenHash;
    invitation.status = "pending";
    invitation.expiresAt = new Date(
      Date.now() + INVITE_EXPIRY_DAYS * 24 * 60 * 60 * 1000,
    );
    invitation.acceptedAt = null;
    invitation.loginEmailSentAt = null;

    const inviter = await User.findById(req.adminActor?.id).select(
      "firstName lastName email",
    );
    const inviterName = [inviter?.firstName, inviter?.lastName]
      .filter(Boolean)
      .join(" ")
      .trim();

    await sendCrmInvitationEmail({
      to: invitation.email,
      inviteeName: [user.firstName, user.lastName].filter(Boolean).join(" "),
      inviterName,
      roleLevel: invitation.level,
      token,
      expiresAt: invitation.expiresAt,
    });

    invitation.emailSentAt = new Date();
    await invitation.save();

    return res.status(200).json({
      success: true,
      message: "Invitation email resent successfully.",
      acceptUrl: `${getCrmAppBaseUrl()}/invite/accept/${token}`,
    });
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error("resendCrmInvitation:", err);
    return res.status(status).json({
      success: false,
      message: err.message || "Failed to resend invitation.",
    });
  }
};
