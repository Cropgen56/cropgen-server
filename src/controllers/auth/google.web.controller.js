import User from "../../models/user.model.js";
import { OAuth2Client } from "google-auth-library";
import {
  generateRefreshId,
  resolveClientAppKey,
  resolveClientSource,
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
import mongoose from "mongoose";
import { resolveBiodropsGoogleAudiences } from "./biodropsGoogleAudiences.js";

function resolveGoogleClientIdByBrand(preset) {
  if (preset === "biodrops") {
    return process.env.BIODROPS_GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID;
  }
  return process.env.GOOGLE_CLIENT_ID;
}

function resolveGoogleAudiencesByBrand(preset) {
  if (preset === "biodrops") {
    return resolveBiodropsGoogleAudiences();
  }
  const primary = resolveGoogleClientIdByBrand(preset);
  return primary ? [primary] : [];
}

export const loginWithGoogleWeb = async (req, res) => {
  return runGoogleWebLogin(req, res, {
    forcedBrand: "cropgen",
    forcedOrgCode: "CROPGEN",
  });
};

export const loginWithGoogleWebCropgen = async (req, res) => {
  return runGoogleWebLogin(req, res, {
    forcedBrand: "cropgen",
    forcedOrgCode: "CROPGEN",
  });
};

export const loginWithGoogleWebBiodrops = async (req, res) => {
  return runGoogleWebLogin(req, res, {
    forcedBrand: "biodrops",
    forcedOrgCode: "BIODROPS",
  });
};

const runGoogleWebLogin = async (
  req,
  res,
  { forcedBrand, forcedOrgCode } = {},
) => {
  try {
    const { token } = req.body;
    const reqPreset = resolveAuthEmailPreset(req);
    const headerBrand = String(
      req.headers?.["x-client-brand"] || req.headers?.["X-Client-Brand"] || "",
    ).toLowerCase();
    const effectiveBrand = (forcedBrand || headerBrand || reqPreset || "cropgen")
      .toLowerCase();
    const preset = effectiveBrand;
    const isBiodropsBrand = effectiveBrand === "biodrops";
    const googleAudiences = resolveGoogleAudiencesByBrand(preset);
    const googleClientId = googleAudiences[0];
    const client = new OAuth2Client(googleClientId);

    if (!token) {
      return res
        .status(400)
        .json({ success: false, message: "Google token is required." });
    }
    if (!googleAudiences.length) {
      return res.status(500).json({
        success: false,
        message: "Google login is not configured for this brand.",
      });
    }

    // Verify MongoDB connection
    if (mongoose.connection.readyState !== 1) {
      console.error(
        "MongoDB not connected, state:",
        mongoose.connection.readyState
      );
      return res
        .status(500)
        .json({ success: false, message: "Database connection error." });
    }

    // Verify token with Google
    const ticket = await client.verifyIdToken({
      idToken: token,
      audience: googleAudiences,
    });

    const payload = ticket.getPayload();
    const { email, name, picture, sub } = payload;

    // Split full name into first and last name
    const nameParts = name.split(" ");
    const firstName = nameParts[0];
    const lastName = nameParts.slice(1).join(" ") || "";

    const targetOrgCode = forcedOrgCode || (isBiodropsBrand ? "BIODROPS" : "CROPGEN");

    // Check if user exists
    let user = await User.findOne({ email }).populate(
      "organization",
      "organizationCode",
    );

    if (user?.deletedAt) {
      return res.status(401).json({
        success: false,
        code: "USER_DELETED",
        message: "User does not exist",
      });
    }

    const wasFullyRegistered =
      !!user && !!user.organization && user.terms === true;

    // Strict organization isolation: CropGen users cannot sign in on Biodrops (and vice versa).
    if (user) {
      const existingOrgCode = String(
        user.organization?.organizationCode || "",
      ).toUpperCase();
      if (isBiodropsBrand) {
        if (existingOrgCode && existingOrgCode !== targetOrgCode) {
          return res.status(403).json({
            success: false,
            message: `Access denied. Only ${targetOrgCode} organization users can sign in here.`,
          });
        }
      } else if (existingOrgCode === "BIODROPS") {
        return res.status(403).json({
          success: false,
          message:
            "Access denied. This account belongs to a different organization.",
        });
      }
    }

   // Backfill clientSource for existing users if missing or invalid
    const resolvedSource = resolveClientSource(req);
    if (user) {
      if (resolvedSource === "ios" || resolvedSource === "android") {
        if (user.clientSource !== resolvedSource) {
          user.clientSource = resolvedSource;
        }
      } else if (!user.clientSource || user.clientSource === "unknown") {
        user.clientSource = resolvedSource;
      }
    }

    const brand = getEmailBrand(preset);
    let orgCode = user?.organization?.organizationCode || targetOrgCode;

    // Create new user if they don't exist (signup / Biodrops Google)
    if (!user) {
      const { org: organization } = await resolveOrganizationByCode(targetOrgCode);
      orgCode = targetOrgCode;
      user = new User({
        firstName,
        lastName,
        email,
        role: "farmer",
        terms: true,
        organization: organization?._id,
        clientSource: resolveClientSource(req),
      });
    }

    // Do not block login on email. Welcome mail is only for new accounts.
    if (!wasFullyRegistered) {
      sendBasicEmail({
        to: email,
        subject: `Welcome to ${brand.name}`,
        html: htmlWelcome(firstName || "Farmer", "", preset),
        text: `Thank you for registering with ${brand.name}!`,
        preset,
      }).catch((e) => {
        console.error("Welcome email error:", e);
      });
    }

    // Generate refreshId and update user
    const refreshId = generateRefreshId();
    setClientRefreshId(user, resolveClientAppKey(req), refreshId);
    if (wasFullyRegistered) user.lastLoginAt = new Date();
    await user.save();

    // Minimal payload for access token
    const tokenPayload = {
      id: user._id,
      role: user.role,
      organization: user.organization,
    };

    const profileComplete =
      !!user.organization && user.terms === true;
    const onboardingRequired = !profileComplete;
    const profileDetailsRequired = isBiodropsBrand
      ? !String(user.phone || "").trim() ||
        !String(user.country || "").trim() ||
        !String(user.state || "").trim() ||
        !String(user.city || "").trim() ||
        !String(user.village || "").trim() ||
        !String(user.pincode || "").trim() ||
        !String(user.firstName || "").trim() ||
        !String(user.lastName || "").trim()
      : !String(user.phone || "").trim() ||
        !String(user.country || "").trim() ||
        !String(user.firstName || "").trim() ||
        !String(user.lastName || "").trim();
    const accessToken = signAccessToken({
      ...tokenPayload,
      onboardingRequired,
      profileDetailsRequired,
    });
    const refreshToken = signRefreshToken(tokenPayload, refreshId);

    // Set HttpOnly refresh cookie
    setRefreshCookie(res, refreshToken, req);

    return res.json({
      success: true,
      message: wasFullyRegistered
        ? "Signed in successfully"
        : "Google login successful",
      accessToken,
      refreshToken,
      role: user.role,
      user: {
        id: user._id,
        email: user.email,
        role: user.role,
        organizationCode: orgCode,
        firstName: user.firstName,
        lastName: user.lastName,
        phone: user.phone,
        country: user.country,
        state: user.state,
        city: user.city,
        village: user.village,
        pincode: user.pincode,
      },
      onboardingRequired,
      profileDetailsRequired,
    });
  } catch (error) {
    console.error("loginWithGoogleWeb:", error.message, error.stack);
    return res.status(error.status || 500).json({
      success: false,
      message: error.message || "Internal server error.",
    });
  }
};
