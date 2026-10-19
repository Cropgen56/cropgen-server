import User from "../../../../models/user.model.js";
import CrmInvitation from "../../models/crm-invitation.model.js";
import { hashInvitationToken } from "../../utils/invitationToken.js";

const LEVEL_LABELS = {
  super: "Super Admin",
  country: "Country Admin",
  state: "State User",
  district: "District Operator",
  ground: "FPO / Agent",
};

export const getCrmInvitationByToken = async (req, res) => {
  try {
    const { token } = req.params;
    if (!token?.trim()) {
      return res.status(400).json({ success: false, message: "Token is required." });
    }

    const invitation = await CrmInvitation.findOne({
      tokenHash: hashInvitationToken(token),
    }).lean();

    if (!invitation) {
      return res.status(404).json({
        success: false,
        message: "Invitation not found or link is invalid.",
      });
    }

    if (invitation.status === "accepted") {
      return res.status(200).json({
        success: true,
        alreadyAccepted: true,
        invitation: await formatPublicInvitation(invitation),
      });
    }

    if (invitation.status !== "pending" || new Date(invitation.expiresAt) < new Date()) {
      if (invitation.status === "pending") {
        await CrmInvitation.updateOne({ _id: invitation._id }, { status: "expired" });
      }
      return res.status(410).json({
        success: false,
        message: "This invitation has expired. Ask your administrator to resend it.",
      });
    }

    return res.status(200).json({
      success: true,
      invitation: await formatPublicInvitation(invitation),
    });
  } catch (err) {
    console.error("getCrmInvitationByToken:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to load invitation.",
    });
  }
};

async function formatPublicInvitation(invitation) {
  const user = await User.findById(invitation.userId)
    .select("firstName lastName email phone")
    .lean();

  const name =
    [user?.firstName, user?.lastName].filter(Boolean).join(" ").trim() ||
    user?.email ||
    "User";

  return {
    id: String(invitation._id),
    status: invitation.status,
    email: invitation.email,
    level: invitation.level,
    roleLabel: LEVEL_LABELS[invitation.level] || invitation.level,
    name,
    phone: user?.phone ? maskPhonePublic(user.phone) : null,
    expiresAt: invitation.expiresAt,
    acceptedAt: invitation.acceptedAt || null,
  };
}

function maskPhonePublic(phone) {
  const digits = String(phone).replace(/\D/g, "");
  if (digits.length >= 4) {
    return `******${digits.slice(-4)}`;
  }
  return phone;
}
