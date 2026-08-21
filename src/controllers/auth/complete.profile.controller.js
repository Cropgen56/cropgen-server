import User from "../../models/user.model.js";
import {
  generateRefreshId,
  resolveClientAppKey,
  setClientRefreshId,
  signAccessToken,
  signRefreshToken,
  setRefreshCookie,
  resolveOrganizationByCode,
} from "../../utils/auth/authUtils.js";
import { sendBasicEmail } from "../../config/sesClient.js";
import {
  getEmailBrand,
  htmlWelcome,
  resolveAuthEmailPreset,
} from "../../utils/email/template.js";

export const completeProfile = async (req, res) => {
  try {
    const userId = req.auth?.id;
    if (!userId)
      return res.status(401).json({ success: false, message: "Unauthorized" });

    const {
      firstName = "",
      lastName = "",
      phone = "",
      email = "",
      language,
      role = "farmer",
      organizationCode,
      terms,
      country = "",
      state = "",
      city = "",
      village = "",
      pincode = "",
    } = req.body;
    const preset = resolveAuthEmailPreset(req);

    if (terms !== true)
      return res.status(400).json({
        success: false,
        message: "Terms must be accepted for signup.",
      });

    if (
      preset === "biodrops" &&
      !country
    ) {
      return res.status(400).json({
        success: false,
        message: "Country is required.",
      });
    }

    if (preset === "biodrops") {
      const normalizedState = String(state || "").trim();
      const normalizedCity = String(city || "").trim();
      const normalizedVillage = String(village || "").trim();
      const normalizedPincode = String(pincode || "").replace(/\D/g, "").trim();
      const countryCode = String(country || "").trim().toUpperCase();

      if (!normalizedState) {
        return res.status(400).json({
          success: false,
          message: "State is required.",
        });
      }
      if (!normalizedCity) {
        return res.status(400).json({
          success: false,
          message: "City is required.",
        });
      }
      if (!normalizedVillage) {
        return res.status(400).json({
          success: false,
          message: "Village / area is required.",
        });
      }
      if (
        !normalizedPincode ||
        (countryCode === "IN" && normalizedPincode.length !== 6)
      ) {
        return res.status(400).json({
          success: false,
          message:
            countryCode === "IN"
              ? "A valid 6-digit pincode is required."
              : "Pincode is required.",
        });
      }
    }

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
      if (preset === "biodrops") {
        ({ org, orgCode } = await resolveOrganizationByCode("BIODROPS"));
      } else {
        ({ org, orgCode } = await resolveOrganizationByCode(
          organizationCode || "CROPGEN",
        ));
      }
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
    if (email) {
      user.email = String(email).trim().toLowerCase();
    }
    if (language) {
      user.language = String(language).toLowerCase();
    }
    user.role = role || "farmer";
    user.country = country ? String(country).trim().toUpperCase() : user.country;
    user.state = state ? String(state).trim().toUpperCase() : user.state;
    user.city = city ? String(city).trim() : user.city;
    user.village = village ? String(village).trim() : user.village;
    user.pincode = pincode ? String(pincode).replace(/\D/g, "").trim() : user.pincode;
    user.terms = true;
    user.organization = org._id;
    user.lastLoginAt = new Date();

    // Generate refreshId and store it
    const refreshId = generateRefreshId();
    setClientRefreshId(user, resolveClientAppKey(req), refreshId);

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
    setRefreshCookie(res, refreshToken, req);

    // Send welcome email (non-critical)
    try {
      const brand = getEmailBrand(preset);
      await sendBasicEmail({
        to: user.email,
        subject: `Welcome to ${brand.name}`,
        html: htmlWelcome(user.firstName, orgCode, preset),
        text: `Welcome to ${brand.name}! You're now part of ${orgCode}.`,
        preset,
      });
    } catch (e) {
      // ignore email errors
    }

    return res.status(201).json({
      success: true,
      message: "Registered & signed in successfully.",
      accessToken: accessToken,
      refreshToken,
      role: user.role,
      user: {
        id: user._id,
        email: user.email,
        role: user.role,
        organizationCode: orgCode,
        country: user.country,
        state: user.state,
        city: user.city,
        village: user.village,
        pincode: user.pincode,
      },
      onboardingRequired: false,
    });
  } catch (e) {
    console.error("completeProfile:", e);
    if (e?.name === "ValidationError") {
      const first = e.errors && Object.values(e.errors)[0];
      return res.status(400).json({
        success: false,
        message: first?.message || "Invalid profile data.",
      });
    }
    return res
      .status(500)
      .json({ success: false, message: "Internal server error." });
  }
};
