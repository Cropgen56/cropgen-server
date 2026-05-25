import axios from "axios";
import crypto from "crypto";
import User from "../../models/user.model.js";
import {
  generateRefreshId,
  resolveClientSource,
  resolveOrganizationByCode,
  setRefreshCookie,
  signAccessToken,
  signRefreshToken,
} from "../../utils/authUtils.js";
import {
  BIODROPS_DEMO_USER_PROFILE,
  biodropsDemoOtpHash,
  isBiodropsDemoOtp,
  isBiodropsDemoPhone,
} from "../../utils/biodropsDemoAccount.js";

const OTP_EXPIRY_MINUTES = 10;
const OTP_RESEND_COOLDOWN = 60 * 1000;

const DEFAULT_LANGUAGE = "en";
const ALLOWED_LANGUAGES = ["en", "hi", "mr"];

// Use WhatsApp template for OTP authentication (WhatsApp template: auth, language: en)
async function sendWhatsappOtpTemplate(phone, otp) {
  // WhatsApp expects the phone string without the "+" for the recipient.
  const num = phone.replace("+", "");
  // This matches the WhatsApp auth template preview: "123456 is your verification code. For your security, do not share this code."
  await axios.post(
    `https://graph.facebook.com/v19.0/${process.env.BIODROPS_WHATSAPP_PHONE_NUMBER_ID}/messages`,
    {
      messaging_product: "whatsapp",
      to: num,
      type: "template",
      template: {
        name: "auth",
        language: { code: "en" },
        components: [
          {
            type: "body",
            parameters: [{ type: "text", text: otp }],
          },
          {
            type: "button",
            sub_type: "url",
            index: "0",
            parameters: [{ type: "text", text: otp }],
          },
        ],
      },
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.BIODROPS_WHATSAPP_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
    },
  );
}

async function createUserByPhoneSafe(payload) {
  try {
    return await User.create(payload);
  } catch (error) {
    // Parallel requests can race at creation time; recover by reading existing user.
    if (error?.code === 11000 && payload?.phone) {
      const existing = await User.findOne({ phone: payload.phone });
      if (existing) return existing;
    }
    throw error;
  }
}

function normalizeLanguage(lang) {
  if (!lang) return DEFAULT_LANGUAGE;
  const v = String(lang).toLowerCase();
  return ALLOWED_LANGUAGES.includes(v) ? v : DEFAULT_LANGUAGE;
}

function assertPhone(phone) {
  const v = String(phone || "").trim();
  // Keep consistent with E.164 (+ and up to 15 digits).
  if (!/^\+\d{8,15}$/.test(v)) {
    const err = new Error("Phone must be in +<countrycode><number> format");
    err.status = 400;
    throw err;
  }
  return v;
}

/**
 * POST /v1/api/auth/biodrops/whatsapp/otp
 * body: { phone, language, country, firstName, lastName, signupIntent }
 */
export const biodropsSendWhatsappOtp = async (req, res) => {
  try {
    const {
      phone: phoneRaw,
      language,
      country,
      firstName = "",
      lastName = "",
      signupIntent,
    } = req.body || {};

    const phone = assertPhone(phoneRaw);
    const lang = normalizeLanguage(language);
    const isDemoPhone = isBiodropsDemoPhone(phone);

    let user = await User.findOne({ phone }).populate("organization");

    // Login path: only existing BIODROPS users may receive OTP (register via signup first).
    if (signupIntent !== true) {
      if (!user && isDemoPhone) {
        const { org: biodropsOrg } = await resolveOrganizationByCode("BIODROPS");
        user = await createUserByPhoneSafe({
          phone,
          ...BIODROPS_DEMO_USER_PROFILE,
          organization: biodropsOrg._id,
          clientSource: resolveClientSource(req),
          language: lang,
        });
      }
      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User does not exist. Please register first.",
        });
      }
      const orgCode = String(
        user?.organization?.organizationCode || "",
      ).toUpperCase();
      if (orgCode !== "BIODROPS") {
        return res.status(403).json({
          success: false,
          message:
            "Access denied. This phone is linked to another organization.",
        });
      }
    }

    // Signup path: do not allow duplicate registration for an existing phone.
    if (signupIntent === true && user) {
      return res.status(409).json({
        success: false,
        message: "User already exists. Please log in.",
      });
    }

    // Signup path: create user for BIODROPS org
    if (!user) {
      const { org: biodropsOrg } = await resolveOrganizationByCode("BIODROPS");
      user = await createUserByPhoneSafe({
        phone,
        firstName: String(firstName || "").trim() || "User",
        lastName: String(lastName || "").trim(),
        role: "farmer",
        terms: false,
        organization: biodropsOrg._id,
        clientSource: resolveClientSource(req),
        language: lang,
        country: country ? String(country).trim().toUpperCase() : null,
      });
      // Race recovery: createUserByPhoneSafe can return an existing user with
      // a different organization. Reject those so we don't leak OTPs across orgs.
      const recoveredOrgId = String(
        user.organization?._id || user.organization || "",
      );
      if (recoveredOrgId !== String(biodropsOrg._id)) {
        return res.status(409).json({
          success: false,
          message:
            "User already exists with a different organization. Please log in.",
        });
      }
    } else {
      user.language = lang;
    }

    // Rate limiting (demo account bypasses for store reviewers)
    if (!isDemoPhone && user.lastOtpSentAt) {
      const diff = Date.now() - new Date(user.lastOtpSentAt).getTime();
      if (diff < OTP_RESEND_COOLDOWN) {
        return res.status(429).json({
          success: false,
          message: "Please wait before requesting another OTP",
        });
      }
    }

    if (isDemoPhone) {
      user.otp = biodropsDemoOtpHash();
    } else {
      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      // Send WhatsApp BEFORE persisting cooldown state, so a failed send does
      // not lock the user out for OTP_RESEND_COOLDOWN with no way to recover.
      await sendWhatsappOtpTemplate(phone, otp);
      user.otp = crypto.createHash("sha256").update(otp).digest("hex");
    }
    user.otpExpires = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);
    user.lastOtpSentAt = new Date();
    user.otpAttemptCount = 0;
    await user.save();

    return res.status(200).json({
      success: true,
      message: "OTP sent successfully",
      data: {
        isNewUser: !user.lastLoginAt,
      },
    });
  } catch (error) {
    const status = Number(error?.status) || 500;
    console.error(
      "biodropsSendWhatsappOtp error:",
      error?.response?.data || error,
    );
    return res.status(status).json({
      success: false,
      message: error?.message || "Failed to send OTP",
    });
  }
};

/**
 * POST /v1/api/auth/biodrops/whatsapp/verify
 * body: { phone, otp }
 */
export const biodropsVerifyWhatsappOtp = async (req, res) => {
  try {
    const { phone: phoneRaw, otp } = req.body || {};
    const phone = assertPhone(phoneRaw);
    const isDemoPhone = isBiodropsDemoPhone(phone);

    if (!otp) {
      return res.status(400).json({
        success: false,
        message: "Phone and OTP are required",
      });
    }

    let user = await User.findOne({ phone }).populate("organization");
    if (!user && isDemoPhone && isBiodropsDemoOtp(otp)) {
      const { org: biodropsOrg } = await resolveOrganizationByCode("BIODROPS");
      user = await createUserByPhoneSafe({
        phone,
        ...BIODROPS_DEMO_USER_PROFILE,
        organization: biodropsOrg._id,
        clientSource: resolveClientSource(req),
      });
      user = await User.findById(user._id).populate("organization");
    }
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User does not exist. Please register first.",
      });
    }
    const orgCode = String(
      user?.organization?.organizationCode || "",
    ).toUpperCase();
    if (orgCode !== "BIODROPS") {
      return res.status(403).json({
        success: false,
        message: "Access denied. This phone is linked to another organization.",
      });
    }

    const demoOtpOk = isDemoPhone && isBiodropsDemoOtp(otp);

    if (!demoOtpOk) {
      if (!user.otp || !user.otpExpires) {
        return res.status(400).json({
          success: false,
          message: "Invalid OTP request",
        });
      }

      if (user.otpExpires < new Date()) {
        return res.status(400).json({ success: false, message: "OTP expired" });
      }

      if (user.otpAttemptCount >= 5) {
        return res
          .status(429)
          .json({ success: false, message: "Too many failed attempts" });
      }
    }

    const otpHash = crypto
      .createHash("sha256")
      .update(String(otp))
      .digest("hex");
    if (!demoOtpOk && otpHash !== user.otp) {
      user.otpAttemptCount += 1;
      await user.save();
      return res.status(400).json({ success: false, message: "Invalid OTP" });
    }

    // OTP success
    user.otp = null;
    user.otpExpires = null;
    user.otpAttemptCount = 0;
    user.lastLoginAt = new Date();
    user.lastActiveAt = new Date();

    const isExisting = !!user.organization && user.terms === true;
    const onboardingRequired = !isExisting;

    const refreshId = generateRefreshId();
    user.refreshTokenId = refreshId;
    await user.save();

    const payload = {
      id: user._id,
      role: user.role,
      // organization was populated above; keep JWT compact by using the id only.
      organization: user.organization?._id || user.organization,
    };

    const accessToken = signAccessToken({ ...payload, onboardingRequired });
    const refreshTokenJwt = signRefreshToken(payload, refreshId);
    setRefreshCookie(res, refreshTokenJwt, req);

    return res.status(200).json({
      success: true,
      message: "Login successful",
      accessToken,
      refreshToken: refreshTokenJwt,
      role: user.role,
      user: {
        id: user._id,
        phone: user.phone,
        role: user.role,
        organizationCode: "BIODROPS",
        country: user.country,
        language: user.language,
      },
      onboardingRequired,
    });
  } catch (error) {
    const status = Number(error?.status) || 500;
    console.error("biodropsVerifyWhatsappOtp error:", error);
    return res
      .status(status)
      .json({ success: false, message: error?.message || "Server error" });
  }
};

/**
 * POST /v1/api/auth/biodrops/whatsapp/resend
 * body: { phone }
 */
export const biodropsResendWhatsappOtp = async (req, res) => {
  try {
    const { phone: phoneRaw } = req.body || {};
    const phone = assertPhone(phoneRaw);
    const isDemoPhone = isBiodropsDemoPhone(phone);

    const user = await User.findOne({ phone }).populate("organization");
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User does not exist. Please register first.",
      });
    }
    const orgCode = String(
      user?.organization?.organizationCode || "",
    ).toUpperCase();
    if (orgCode !== "BIODROPS") {
      return res.status(403).json({
        success: false,
        message: "Access denied. This phone is linked to another organization.",
      });
    }

    if (!isDemoPhone && user.lastOtpSentAt) {
      const diff = Date.now() - new Date(user.lastOtpSentAt).getTime();
      if (diff < OTP_RESEND_COOLDOWN) {
        return res.status(429).json({
          success: false,
          message: "Please wait before requesting OTP again",
        });
      }
    }

    if (isDemoPhone) {
      user.otp = biodropsDemoOtpHash();
    } else {
      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      // Send WhatsApp BEFORE persisting cooldown state, so a failed send does
      // not lock the user out for OTP_RESEND_COOLDOWN with no way to recover.
      await sendWhatsappOtpTemplate(phone, otp);
      user.otp = crypto.createHash("sha256").update(otp).digest("hex");
    }
    user.otpExpires = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);
    user.lastOtpSentAt = new Date();
    user.otpAttemptCount = 0;
    await user.save();

    return res.status(200).json({
      success: true,
      message: "OTP resent successfully",
    });
  } catch (error) {
    const status = Number(error?.status) || 500;
    console.error(
      "biodropsResendWhatsappOtp error:",
      error?.response?.data || error,
    );
    return res.status(status).json({
      success: false,
      message: error?.message || "Failed to resend OTP",
    });
  }
};
