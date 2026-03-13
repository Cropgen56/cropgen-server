import User from "../../models/user.model.js";
import {
  generateRefreshId,
  signAccessToken,
  signRefreshToken,
  setRefreshCookie,
  resolveOrganizationByCode,
} from "../../utils/authUtils.js";
import { sendBasicEmail } from "../../config/sesClient.js";
import { htmlWelcome } from "../../utils/emailTemplate.js";

export const completeProfile = async (req, res) => {
  try {
    const userId = req.auth?.id;
    if (!userId)
      return res.status(401).json({ success: false, message: "Unauthorized" });

    const {
      firstName = "",
      lastName = "",
      phone = "",
      role = "farmer",
      organizationCode,
      terms,
    } = req.body;

    if (terms !== true)
      return res.status(400).json({
        success: false,
        message: "Terms must be accepted for signup.",
      });

    const user = await User.findById(userId);
    if (!user)
      return res
        .status(404)
        .json({ success: false, message: "User not found." });

    if (user.organization && user.terms === true) {
      return res
        .status(400)
        .json({ success: false, message: "Profile already completed." });
    }

    let org, orgCode;
    try {
      ({ org, orgCode } = await resolveOrganizationByCode(organizationCode));
    } catch (err) {
      if (err.status === 404) {
        return res.status(404).json({
          success: false,
          message: `Organization '${organizationCode}' not found.`,
        });
      }
      throw err;
    }

    // Update user details
    user.firstName = firstName;
    user.lastName = lastName;
    user.phone = phone;
    user.role = role || "farmer";
    user.terms = true;
    user.organization = org._id;
    user.lastLoginAt = new Date();

    // Generate refreshId and store it
    const refreshId = generateRefreshId();
    user.refreshTokenId = refreshId;

    await user.save();

    // Minimal payload for tokens
    const payload = {
      id: user._id,
      role: user.role,
      organization: user.organization,
    };

    // Issue access and refresh tokens
    const accessToken = signAccessToken({
      ...payload,
      onboardingRequired: false,
    });
    const refreshToken = signRefreshToken(payload, refreshId);

    // Set HttpOnly refresh cookie
    setRefreshCookie(res, refreshToken);

    // Send welcome email (non-critical)
    try {
      await sendBasicEmail({
        to: user.email,
        subject: "Welcome to CropGen",
        html: htmlWelcome(user.firstName, orgCode),
        text: `Welcome to CropGen! You're now part of ${orgCode}.`,
      });
    } catch (e) {
      // ignore email errors
    }

    return res.status(201).json({
      success: true,
      message: "Registered & signed in successfully.",
      accessToken: accessToken,
      role: user.role,
      user: {
        id: user._id,
        email: user.email,
        role: user.role,
        organizationCode: orgCode,
      },
      onboardingRequired: false,
    });
  } catch (e) {
    console.error("completeProfile:", e);
    return res
      .status(500)
      .json({ success: false, message: "Internal server error." });
  }
};
