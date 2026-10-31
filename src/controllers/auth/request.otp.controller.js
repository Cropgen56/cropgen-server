import User from "../../models/user.model.js";
import { sendBasicEmail } from "../../config/sesClient.js";
import { genOtp, hash, resolveOrganizationByCode } from "../../utils/auth/authUtils.js";
import {
  DEFAULT_ORG_CODE,
  findUserByEmail,
  requestOrgCode,
} from "../../utils/auth/orgScope.js";
import {
  htmlOtp,
  getEmailBrand,
  resolveAuthEmailPreset,
} from "../../utils/email/template.js";

export const requestOtp = async (req, res) => {
  try {
    const { email, signupIntent } = req.body;
    const clientBrand = String(
      req.headers?.["x-client-brand"] || req.headers?.["X-Client-Brand"] || "",
    ).toLowerCase();
    const isBiodropsBrand = clientBrand === "biodrops";
    if (!email)
      return res
        .status(400)
        .json({ success: false, message: "Email is required." });

    // Accounts are per organization: look only inside the calling app's org.
    // A signup from an app that sends no org registers under CROPGEN.
    const requestOrg = requestOrgCode(req);
    const isSignup = signupIntent === true;
    let signupOrg = null;
    if (isSignup && requestOrg) {
      const { org } = await resolveOrganizationByCode(requestOrg);
      signupOrg = org;
    }

    let user = await findUserByEmail(
      email,
      isSignup ? requestOrg || DEFAULT_ORG_CODE : requestOrg,
      { deletedAt: null },
    );

    // Biodrops login restriction: send OTP only to registered BIODROPS users.
    // A farmer who never finished signup is not registered yet.
    if (isBiodropsBrand && signupIntent !== true) {
      if (!user || (user.role === "farmer" && user.terms !== true)) {
        return res.status(404).json({
          success: false,
          code: "NOT_REGISTERED",
          message:
            "This email is not registered. Please create an account first.",
        });
      }

      await user.populate("organization");
      const orgCode = String(user.organization?.organizationCode || "").toUpperCase();
      if (orgCode !== "BIODROPS") {
        return res.status(403).json({
          success: false,
          message:
            "Access denied. Only BIODROPS organization users can log in here.",
        });
      }
    }

    // CropGen login (the app sends signupIntent: false): only a completed
    // account gets an OTP — no placeholder is created for an unknown email.
    // Apps that omit signupIntent keep the old create-if-missing behavior.
    if (!isBiodropsBrand && signupIntent === false) {
      const registered = !!user?.organization && user.terms === true;
      if (!registered) {
        return res.status(404).json({
          success: false,
          code: "NOT_REGISTERED",
          message:
            "This email is not registered. Please create an account first.",
        });
      }
    }

    // Sign-up flow only: block OTP if this email already has a completed account
    if (signupIntent === true && user) {
      const fullyRegistered =
        !!user.organization && user.terms === true;
      if (fullyRegistered) {
        return res.status(400).json({
          success: false,
          message:
            "This email is already registered. Try logging in or use a different email.",
        });
      }
    }

    // create placeholder if missing (no org yet)
    if (!user) {
      user = await User.create({
        email,
        terms: false,
        role: "farmer",
        clientSource: "web",
        ...(signupOrg ? { organization: signupOrg._id } : {}),
      });
    } else {
      // Backfill clientSource for legacy users
      if (!user.clientSource || user.clientSource === "unknown") {
        user.clientSource = "web";
      }

      // Signup registers under the calling app's organization.
      if (signupOrg && !user.organization) {
        user.organization = signupOrg._id;
      }
      await user.save();
    }

    // throttle: 60s between sends
    const now = Date.now();
    if (user.lastOtpSentAt && now - user.lastOtpSentAt.getTime() < 60 * 1000) {
      return res.status(429).json({
        success: false,
        message: "Please wait before requesting another OTP.",
      });
    }

    const code = genOtp();
    user.otp = await hash(code);
    user.otpExpires = new Date(now + 10 * 60 * 1000);
    user.otpAttemptCount = 0;
    user.lastOtpSentAt = new Date(now);
    await user.save();

    const preset = resolveAuthEmailPreset(req);
    const brand = getEmailBrand(preset);
    await sendBasicEmail({
      to: email,
      subject: `Your ${brand.name} verification code`,
      html: htmlOtp(code, preset),
      text: `Your ${brand.name} verification code is ${code}. It expires in 10 minutes. If you didn’t request this, ignore this email.`,
      preset,
    });

    return res.json({ success: true, message: "OTP sent to email." });
  } catch (err) {
    if (err.status === 404) {
      return res.status(404).json({ success: false, message: err.message });
    }
    if (err.code === "EmailNotVerified") {
      return res.status(400).json({ success: false, message: err.message });
    }
    console.error("requestOtp error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to send OTP. Please try again later.",
    });
  }
};
