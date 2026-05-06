import axios from "axios";
import crypto from "crypto";
import User from "../../models/user.model.js";
import {
  generateRefreshId,
  resolveOrganizationByCode,
  setRefreshCookie,
  signAccessToken,
  signRefreshToken,
} from "../../utils/authUtils.js";
import { whatsappLanguageMap } from "../../utils/whatsapputility/whatsapplanguage.map.js";

const OTP_EXPIRY_MINUTES = 10;
const OTP_RESEND_COOLDOWN = 60 * 1000;

const DEFAULT_LANGUAGE = "en";
const ALLOWED_LANGUAGES = ["en", "hi", "mr"];

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

async function sendWhatsappTemplateOtp(phone, otp, language) {
  const waLanguage =
    whatsappLanguageMap[language] || process.env.WHATSAPP_TEMPLATE_LANG;
  const templateName =
    String(process.env.WHATSAPP_TEMPLATE_NAME || "").trim() ||
    "otp_login_code";

  // Helpful runtime visibility during integration with Meta templates.
  console.log("WhatsApp template in use:", templateName);

  await axios.post(
    `https://graph.facebook.com/v19.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
    {
      messaging_product: "whatsapp",
      to: phone.replace("+", ""),
      type: "template",
      template: {
        name: templateName,
        language: { code: waLanguage },
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
        Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
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

    const { org: biodropsOrg } = await resolveOrganizationByCode("BIODROPS");

    let user = await User.findOne({ phone }).populate("organization");

    // Login path: only existing BIODROPS users may receive OTP (register via signup first).
    if (signupIntent !== true) {
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
      user = await createUserByPhoneSafe({
        phone,
        firstName: String(firstName || "").trim() || "User",
        lastName: String(lastName || "").trim(),
        role: "farmer",
        terms: false,
        organization: biodropsOrg._id,
        clientSource: "web",
        language: lang,
        country: country ? String(country).trim().toUpperCase() : null,
      });
    } else {
      user.language = lang;
    }

    // Rate limiting
    if (user.lastOtpSentAt) {
      const diff = Date.now() - new Date(user.lastOtpSentAt).getTime();
      if (diff < OTP_RESEND_COOLDOWN) {
        return res.status(429).json({
          success: false,
          message: "Please wait before requesting another OTP",
        });
      }
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpHash = crypto.createHash("sha256").update(otp).digest("hex");

    user.otp = otpHash;
    user.otpExpires = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);
    user.lastOtpSentAt = new Date();
    user.otpAttemptCount = 0;
    await user.save();

    await sendWhatsappTemplateOtp(phone, otp, user.language || lang);

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

    if (!otp) {
      return res.status(400).json({
        success: false,
        message: "Phone and OTP are required",
      });
    }

    const user = await User.findOne({ phone }).populate("organization");
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User does not exist. Please register first.",
      });
    }
    const orgCode = String(user?.organization?.organizationCode || "").toUpperCase();
    if (orgCode !== "BIODROPS") {
      return res.status(403).json({
        success: false,
        message:
          "Access denied. This phone is linked to another organization.",
      });
    }

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

    const otpHash = crypto.createHash("sha256").update(String(otp)).digest("hex");
    if (otpHash !== user.otp) {
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
      organization: user.organization,
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

    const user = await User.findOne({ phone }).populate("organization");
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User does not exist. Please register first.",
      });
    }
    const orgCode = String(user?.organization?.organizationCode || "").toUpperCase();
    if (orgCode !== "BIODROPS") {
      return res.status(403).json({
        success: false,
        message:
          "Access denied. This phone is linked to another organization.",
      });
    }

    if (user.lastOtpSentAt) {
      const diff = Date.now() - new Date(user.lastOtpSentAt).getTime();
      if (diff < OTP_RESEND_COOLDOWN) {
        return res.status(429).json({
          success: false,
          message: "Please wait before requesting OTP again",
        });
      }
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpHash = crypto.createHash("sha256").update(otp).digest("hex");

    user.otp = otpHash;
    user.otpExpires = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);
    user.lastOtpSentAt = new Date();
    user.otpAttemptCount = 0;
    await user.save();

    await sendWhatsappTemplateOtp(phone, otp, user.language || DEFAULT_LANGUAGE);

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
    return res
      .status(status)
      .json({ success: false, message: error?.message || "Failed to resend OTP" });
  }
};

