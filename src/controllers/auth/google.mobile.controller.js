import { OAuth2Client } from "google-auth-library";
import User from "../../models/user.model.js";
import { sendBasicEmail } from "../../config/sesClient.js";
import {
  getEmailBrand,
  htmlWelcomeBack,
  htmlWelcome,
  resolveAuthEmailPreset,
} from "../../utils/email/template.js";
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
import { resolveBiodropsGoogleAudiences } from "./biodropsGoogleAudiences.js";

function resolveGoogleMobileAudiencesByBrand(preset) {
  if (preset === "biodrops") {
    return resolveBiodropsGoogleAudiences();
  }
  // CropGen native apps: prefer dedicated mobile client IDs, fall back to web client.
  return [
    process.env.MOBILE_GOOGLE_CLIENT_ID,
    process.env.ANDROID_GOOGLE_CLIENT_ID,
    process.env.IOS_GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_ID,
  ].filter(Boolean);
}

export const loginWithGoogleMobile = async (req, res) => {
  return runGoogleMobileLogin(req, res, {
    forcedBrand: "cropgen",
    forcedOrgCode: "CROPGEN",
  });
};

export const loginWithGoogleMobileBiodrops = async (req, res) => {
  return runGoogleMobileLogin(req, res, {
    forcedBrand: "biodrops",
    forcedOrgCode: "BIODROPS",
  });
};

const runGoogleMobileLogin = async (
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
    const googleAudiences = resolveGoogleMobileAudiencesByBrand(preset);
    const googleClientId = googleAudiences[0];

    if (!token) {
      return res
        .status(400)
        .json({ success: false, message: "Google token is required." });
    }
    if (!googleAudiences.length) {
      return res.status(500).json({
        success: false,
        message: "Google mobile login is not configured for this brand.",
      });
    }

    const clientMobile = new OAuth2Client(googleClientId);

    // Verify token with Google
    const ticket = await clientMobile.verifyIdToken({
      idToken: token,
      audience: googleAudiences,
    });

    const payloadData = ticket.getPayload();
    const { email, name } = payloadData;

    const nameParts = name.split(" ");
    const firstName = nameParts[0];
    const lastName = nameParts.slice(1).join(" ") || "";

    let user = await User.findOne({ email }).populate("organization");
    const wasFullyRegistered =
      !!user && !!user.organization && user.terms === true;

    const targetOrgCode =
      forcedOrgCode || (effectiveBrand === "biodrops" ? "BIODROPS" : "CROPGEN");
    const { org: organization, orgCode } =
      await resolveOrganizationByCode(targetOrgCode);

    // Keep organization isolation consistent with web login behavior.
    if (user) {
      const existingOrgCode = String(
        user.organization?.organizationCode || "",
      ).toUpperCase();
      if (existingOrgCode && existingOrgCode !== targetOrgCode) {
        if (targetOrgCode === "BIODROPS") {
          user.organization = organization._id;
          if (!user.terms) user.terms = true;
        } else {
          return res.status(403).json({
            success: false,
            message: `Access denied. Only ${targetOrgCode} organization users can sign in here.`,
          });
        }
      }
    }

    const resolvedSource = resolveClientSource(req);
    if (user) {
      let changed = false;
      if (resolvedSource === "ios" || resolvedSource === "android") {
        if (user.clientSource !== resolvedSource) {
          user.clientSource = resolvedSource;
          changed = true;
        }
      } else if (!user.clientSource || user.clientSource === "unknown") {
        user.clientSource = resolvedSource;
        changed = true;
      }
      if (changed) await user.save();
    }

    const brand = getEmailBrand(preset);
    // Prepare email details based on user status
    const emailDetails = wasFullyRegistered
      ? {
          to: email,
          subject: `Signed in to ${brand.name}`,
          html: htmlWelcomeBack(user.firstName || user.email, preset),
          text: `You're signed in to ${brand.name}.`,
          errorMessage: "Welcome back email error:",
        }
      : {
          to: email,
          subject: `Welcome to ${brand.name}`,
          html: htmlWelcome(firstName || "Farmer", "", preset),
          text: `Thank you for registering with ${brand.name}!`,
          errorMessage: "Welcome email error:",
        };

    // Create new user if they don't exist
    if (!user) {
      user = new User({
        firstName,
        lastName,
        email,
        role: "farmer",
        terms: true,
        organization: organization?._id,
        clientSource: resolvedSource,
      });
      await user.save();
    }

    // Send appropriate email (non-critical)
    try {
      await sendBasicEmail({
        to: emailDetails.to,
        subject: emailDetails.subject,
        html: emailDetails.html,
        text: emailDetails.text,
        preset,
      });
    } catch (e) {
      console.error(emailDetails.errorMessage, e);
    }

    const tokenPayload = {
      id: user._id,
      role: user.role,
      organization: user.organization,
    };
    const profileComplete = !!user.organization && user.terms === true;
    const onboardingRequired = !profileComplete;
    const accessToken = signAccessToken({
      ...tokenPayload,
      onboardingRequired,
    });
    const refreshId = generateRefreshId();
    setClientRefreshId(user, resolveClientAppKey(req), refreshId);
    await user.save();
    const refreshToken = signRefreshToken(tokenPayload, refreshId);
    setRefreshCookie(res, refreshToken, req);

    res.json({
      success: true,
      message: wasFullyRegistered
        ? "Signed in successfully"
        : "Google login successful",
      accessToken,
      refreshToken,
      role: user.role,
      user: profileComplete
        ? {
            id: user._id,
            email: user.email,
            role: user.role,
            organizationCode: orgCode,
          }
        : { id: user._id, email: user.email },
      onboardingRequired,
    });
  } catch (error) {
    console.error("loginWithGoogleMobile:", error.message, error.stack);
    res.status(error.status || 400).json({
      success: false,
      message: error.message || "Invalid Google Token",
      error,
    });
  }
};
