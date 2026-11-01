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
    const isFarmer = user.role === "farmer";
    const who = name ? `${isFarmer ? "Registered farmer" : "Existing account"} ${name}` : null;

    // Which typed value matched — lets the form explain conflicts precisely.
    const matchedBy = [
      normalizedPhone && user.phone && user.phone.replace(/\D/g, "").endsWith(normalizedPhone.replace(/\D/g, "").slice(-10))
        ? "phone"
        : null,
      normalizedEmail && user.email?.toLowerCase() === normalizedEmail ? "email" : null,
    ].filter(Boolean);

    return res.status(200).json({
      success: true,
      canInvite: true,
      status: "existing",
      message: isFarmer
        ? `${who || "A registered farmer"} found — details loaded. Sending this invite upgrades them to CRM staff; their farms and history stay linked.`
        : `${who || "An existing account"} found — details loaded. Sending this invite gives them CRM access.`,
      existingUser: {
        id: String(user._id),
        name: name || null,
        firstName: user.firstName || null,
        lastName: user.lastName || null,
        email: user.email || null,
        phone: user.phone || null,
        role: user.role,
        isFarmer,
        country: user.country || null,
        state: user.state || null,
        district: user.district || null,
        city: user.city || null,
        village: user.village || null,
        matchedBy,
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
