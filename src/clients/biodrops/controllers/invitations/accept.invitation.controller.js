import User from "../../../../models/user.model.js";
import CrmInvitation from "../../models/crm-invitation.model.js";
import { hashInvitationToken } from "../../utils/invitationToken.js";
import { sendCrmLoginInstructionsEmail } from "../../services/crmInvitationEmail.service.js";

export const acceptCrmInvitation = async (req, res) => {
  try {
    const { token, acceptTerms } = req.body || {};
    const tokenFromParams = req.params?.token;
    const rawToken = (token || tokenFromParams || "").trim();

    if (!rawToken) {
      return res.status(400).json({ success: false, message: "Token is required." });
    }

    if (acceptTerms !== true) {
      return res.status(400).json({
        success: false,
        message: "You must accept the terms to verify your invitation.",
      });
    }

    const invitation = await CrmInvitation.findOne({
      tokenHash: hashInvitationToken(rawToken),
    });

    if (!invitation) {
      return res.status(404).json({
        success: false,
        message: "Invitation not found or link is invalid.",
      });
    }

    if (invitation.status === "accepted") {
      return res.status(200).json({
        success: true,
        message: "Invitation already verified.",
        alreadyAccepted: true,
      });
    }

    if (invitation.status !== "pending") {
      return res.status(410).json({
        success: false,
        message: "This invitation is no longer valid.",
      });
    }

    if (new Date(invitation.expiresAt) < new Date()) {
      invitation.status = "expired";
      await invitation.save();
      return res.status(410).json({
        success: false,
        message: "This invitation has expired. Ask your administrator to resend it.",
      });
    }

    const user = await User.findById(invitation.userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User account not found.",
      });
    }

    if (!user.phone) {
      return res.status(400).json({
        success: false,
        message:
          "A mobile number is required for CRM login. Contact your administrator to add your phone number.",
      });
    }

    user.terms = true;
    await user.save();

    invitation.status = "accepted";
    invitation.acceptedAt = new Date();
    await invitation.save();

    let loginEmailSent = false;
    try {
      await sendCrmLoginInstructionsEmail({
        to: invitation.email,
        userId: user._id,
      });
      invitation.loginEmailSentAt = new Date();
      await invitation.save();
      loginEmailSent = true;
    } catch (emailErr) {
      console.error("acceptCrmInvitation login email:", emailErr);
    }

    return res.status(200).json({
      success: true,
      message: loginEmailSent
        ? "Invitation verified. Check your email for login instructions."
        : "Invitation verified. Sign in using WhatsApp OTP on the CRM login page.",
      loginEmailSent,
    });
  } catch (err) {
    console.error("acceptCrmInvitation:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Failed to verify invitation.",
    });
  }
};
