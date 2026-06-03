import User from "../../models/user.model.js";
import {
  generateRefreshId,
  signAccessToken,
  signRefreshToken,
  setRefreshCookie,
  compare,
  resolveClientAppKey,
  setClientRefreshId,
} from "../../utils/auth/authUtils.js";
import { enrichBiodropsAuthPayload } from "../../clients/biodrops/utils/authPayload.js";
import { sendBasicEmail } from "../../config/sesClient.js";
import {
  getEmailBrand,
  htmlWelcomeBack,
  resolveAuthEmailPreset,
} from "../../utils/email/template.js";

export const verifyOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;
    const clientBrand = String(
      req.headers?.["x-client-brand"] || req.headers?.["X-Client-Brand"] || "",
    ).toLowerCase();
    const isBiodropsBrand = clientBrand === "biodrops";

    if (!email || !otp)
      return res
        .status(400)
        .json({ success: false, message: "Email and OTP are required." });

    const user = await User.findOne({ email }).populate("organization");
    if (!user || !user.otp || !user.otpExpires) {
      return res.status(400).json({
        success: false,
        message: "No pending OTP. Please request a new OTP.",
      });
    }

    // expired?
    if (user.otpExpires.getTime() < Date.now()) {
      user.otp = null;
      user.otpExpires = null;
      await user.save();
      return res.status(400).json({
        success: false,
        message: "OTP expired. Please request a new OTP.",
      });
    }

    // attempts guard
    if (user.otpAttemptCount >= 5) {
      user.otp = null;
      user.otpExpires = null;
      await user.save();
      return res.status(429).json({
        success: false,
        message: "Too many attempts. Request a new OTP.",
      });
    }

    const ok = await compare(otp, user.otp);
    if (!ok) {
      user.otpAttemptCount += 1;
      await user.save();
      return res.status(401).json({ success: false, message: "Invalid OTP." });
    }

    // Biodrops restriction: only BIODROPS organization users can log in
    if (isBiodropsBrand) {
      const orgCode = String(user.organization?.organizationCode || "").toUpperCase();
      if (orgCode !== "BIODROPS") {
        // Clear OTP metadata so the same code can't be replayed after rejection
        user.otp = null;
        user.otpExpires = null;
        user.otpAttemptCount = 0;
        await user.save();
        return res.status(403).json({
          success: false,
          message:
            "Access denied. Only BIODROPS organization users can sign in here.",
        });
      }
    }

    // success → clear OTP meta
    user.otp = null;
    user.otpExpires = null;
    user.otpAttemptCount = 0;

    const isExisting = !!user.organization && user.terms === true;

    // generate refreshId & store per client app (admin vs biodrops do not clobber each other)
    const refreshId = generateRefreshId();
    setClientRefreshId(user, resolveClientAppKey(req), refreshId);
    if (isExisting) user.lastLoginAt = new Date();
    await user.save();

    let payload = {
      id: user._id,
      role: user.role,
      organization: user.organization?._id || user.organization,
    };
    if (isBiodropsBrand) {
      payload = await enrichBiodropsAuthPayload(payload, user);
    }

    const onboardingRequired = !isExisting;
    const accessToken = signAccessToken({ ...payload, onboardingRequired });
    const refreshToken = signRefreshToken(payload, refreshId);

    // set HttpOnly refresh cookie
    setRefreshCookie(res, refreshToken, req);

    const orgCode = user.organization?.organizationCode || "CROPGEN";

    // welcome back (non-critical)
    if (isExisting) {
      try {
        const preset = resolveAuthEmailPreset(req);
        const brand = getEmailBrand(preset);
        await sendBasicEmail({
          to: email,
          subject: `Signed in to ${brand.name}`,
          html: htmlWelcomeBack(user.firstName || user.email, preset),
          text: `You're signed in to ${brand.name}.`,
          preset,
        });
      } catch (e) {
        // ignore email errors
      }
    }

    return res.json({
      success: true,
      message: isExisting
        ? "signed in successfully"
        : "OTP verified successfully",
      accessToken: accessToken,
      refreshToken,
      role: user.role,
      user: isExisting
        ? {
            id: user._id,
            email: user.email,
            role: user.role,
            organizationCode: orgCode,
          }
        : { id: user._id, email: user.email },
      onboardingRequired,
    });
  } catch (e) {
    console.error("verifyOtp:", e);
    return res
      .status(500)
      .json({ success: false, message: "Internal server error." });
  }
};
