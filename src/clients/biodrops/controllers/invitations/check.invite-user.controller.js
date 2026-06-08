import { resolveBiodropsTenantId } from "../../utils/authPayload.js";
import {
  normalizeInvitePhone,
  resolveInviteUser,
} from "../../utils/inviteUserResolve.js";

export const checkCrmInviteUser = async (req, res) => {
  try {
    const { phone, email } = req.query || {};
    const normalizedPhone = normalizeInvitePhone(phone);
    const normalizedEmail = email?.trim().toLowerCase() || null;

    if (!normalizedPhone && !normalizedEmail) {
      return res.status(400).json({
        success: false,
        canInvite: false,
        message: "Phone or email is required.",
      });
    }

    const tenantId = await resolveBiodropsTenantId();
    const resolved = await resolveInviteUser({
      normalizedPhone,
      normalizedEmail,
      tenantId,
    });

    if (resolved.error) {
      return res.status(200).json({
        success: true,
        canInvite: false,
        status: resolved.error.reason || "blocked",
        message: resolved.error.message,
      });
    }

    if (!resolved.user) {
      return res.status(200).json({
        success: true,
        canInvite: true,
        status: "new",
        message: "No existing account found. A new user will be created.",
      });
    }

    const user = resolved.user;
    const name = [user.firstName, user.lastName]
      .filter(Boolean)
      .join(" ")
      .trim();

    return res.status(200).json({
      success: true,
      canInvite: true,
      status: "existing",
      message: name
        ? `Existing account found (${name}). It will be upgraded to CRM staff.`
        : "Existing account found. It will be upgraded to CRM staff.",
      existingUser: {
        id: String(user._id),
        name: name || null,
        email: user.email || null,
        phone: user.phone || null,
        role: user.role,
      },
    });
  } catch (err) {
    console.error("checkCrmInviteUser:", err);
    return res.status(err.status || 500).json({
      success: false,
      canInvite: false,
      message: err.message || "Failed to check invite user.",
    });
  }
};
