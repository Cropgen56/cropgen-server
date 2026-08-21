import jwt from "jsonwebtoken";
import crypto from "crypto";
import axios from "axios";
import User from "../../models/user.model.js";
import Organization from "../../models/organization.model.js";
import { whatsappLanguageMap } from "../../utils/whatsapp/languageMap.js";
import {
  generateRefreshId,
  resolveClientAppKey,
  resolveClientSource,
  resolveOrganizationByCode,
  setClientRefreshId,
  setRefreshCookie,
  signAccessToken,
  signRefreshToken,
} from "../../utils/auth/authUtils.js";

/* ================= CONSTANTS ================= */

const OTP_EXPIRY_MINUTES = 10;
const OTP_RESEND_COOLDOWN = 60 * 1000;

const ALLOWED_LANGUAGES = ["en", "hi", "mr"];
const DEFAULT_LANGUAGE = "en";
const DEFAULT_ORG_CODE = "CROPGEN";
const EMAIL_OK = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function createUserByPhoneSafe(payload) {
  try {
    return await User.create(payload);
  } catch (error) {
    if (error?.code === 11000 && payload?.phone) {
      const existing = await User.findOne({ phone: payload.phone });
      if (existing) return existing;
    }
    throw error;
  }
}

function normalizeLanguage(language) {
  if (!language) return null;
  return ALLOWED_LANGUAGES.includes(language) ? language : DEFAULT_LANGUAGE;
}

function normalizeOrgCode(organizationCode) {
  const code = String(organizationCode || "")
    .trim()
    .toUpperCase();
  return code || DEFAULT_ORG_CODE;
}

function normalizeEmail(email) {
  return String(email || "")
    .trim()
    .toLowerCase();
}

async function sendWhatsappOtpTemplate(phone, otp, language) {
  const waLanguage =
    whatsappLanguageMap[language] || process.env.WHATSAPP_TEMPLATE_LANG;

  await axios.post(
    `https://graph.facebook.com/v19.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
    {
      messaging_product: "whatsapp",
      to: phone.replace("+", ""),
      type: "template",
      template: {
        name: process.env.WHATSAPP_TEMPLATE_NAME,
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

function hashOtp(otp) {
  return crypto.createHash("sha256").update(otp).digest("hex");
}

function isWebClient(req) {
  return resolveClientAppKey(req) === "cropgen_web";
}

function isProfileComplete(user) {
  return (
    !!user?.organization &&
    user.terms === true &&
    Boolean(String(user.firstName || "").trim()) &&
    Boolean(String(user.phone || "").trim()) &&
    Boolean(String(user.country || "").trim())
  );
}

/* ================= SEND OTP ================= */

export const sendWhatsappOtp = async (req, res) => {
  try {
    const {
      phone,
      language,
      organizationCode,
      firstName = "",
      lastName = "",
      email = "",
      country = "",
      signupIntent,
    } = req.body || {};

    const phoneRegex = /^\+\d{8,15}$/;
    if (!phone || !phoneRegex.test(phone)) {
      return res.status(400).json({
        success: false,
        message: "Phone must be in +<countrycode><number> format",
      });
    }

    const isSignup = signupIntent === true;
    const isLogin = signupIntent === false;
    const normalizedLanguage = normalizeLanguage(language);
    const requestedOrgCode = normalizeOrgCode(organizationCode);
    const normalizedEmail = normalizeEmail(email);

    let user = await User.findOne({ phone });

    if (user?.deletedAt) {
      return res.status(404).json({
        success: false,
        code: "USER_DELETED",
        message: "User does not exist",
      });
    }

    // Web login: never create an account. Fast exist-check + OTP only.
    if (isLogin) {
      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User does not exist",
        });
      }
    }

    // Signup: reject duplicates, then create with profile + org.
    if (isSignup) {
      if (user) {
        return res.status(409).json({
          success: false,
          message: "User already exists. Please log in.",
        });
      }

      if (normalizedEmail && !EMAIL_OK.test(normalizedEmail)) {
        return res.status(400).json({
          success: false,
          message: "Please enter a valid email address",
        });
      }

      if (normalizedEmail) {
        const emailOwner = await User.findOne({ email: normalizedEmail })
          .select("_id")
          .lean();
        if (emailOwner) {
          return res.status(409).json({
            success: false,
            message: "This email is already registered. Please log in.",
          });
        }
      }

      let organization;
      try {
        const resolved = await resolveOrganizationByCode(requestedOrgCode);
        organization = resolved.org;
      } catch (err) {
        return res.status(err.status || 404).json({
          success: false,
          message:
            err.message || `Organization '${requestedOrgCode}' not found`,
        });
      }

      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      await sendWhatsappOtpTemplate(
        phone,
        otp,
        normalizedLanguage || DEFAULT_LANGUAGE,
      );

      user = await createUserByPhoneSafe({
        phone,
        email: normalizedEmail || undefined,
        firstName: String(firstName || "").trim() || "User",
        lastName: String(lastName || "").trim(),
        role: "farmer",
        terms: true,
        organization: organization._id,
        clientSource: resolveClientSource(req),
        language: normalizedLanguage || DEFAULT_LANGUAGE,
        country: country ? String(country).trim().toUpperCase() : null,
        otp: hashOtp(otp),
        otpExpires: new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000),
        lastOtpSentAt: new Date(),
        otpAttemptCount: 0,
      });

      return res.status(200).json({
        success: true,
        message: "OTP sent successfully",
        data: { isNewUser: true },
      });
    }

    // Legacy clients that omit signupIntent keep previous create-if-missing behavior.
    if (!user) {
      const organization = await Organization.findOne({
        organizationCode: requestedOrgCode,
      });

      if (!organization) {
        return res.status(404).json({
          success: false,
          message: `Organization '${requestedOrgCode}' not found`,
        });
      }

      user = await createUserByPhoneSafe({
        phone,
        firstName: "User",
        role: "farmer",
        terms: true,
        organization: organization._id,
        clientSource: resolveClientSource(req),
        language: normalizedLanguage,
      });
    }

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
    await sendWhatsappOtpTemplate(
      phone,
      otp,
      user.language || normalizedLanguage,
    );

    if (normalizedLanguage && user.language !== normalizedLanguage && !isLogin) {
      user.language = normalizedLanguage;
    }

    user.otp = hashOtp(otp);
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
    console.error("Send OTP Error:", error?.response?.data || error);
    return res.status(500).json({
      success: false,
      message: "Failed to send OTP",
    });
  }
};

/* ================= VERIFY OTP ================= */

export const verifyWhatsappOtp = async (req, res) => {
  try {
    const { phone, otp } = req.body;

    if (!phone || !otp) {
      return res.status(400).json({
        success: false,
        message: "Phone and OTP are required",
      });
    }

    const user = await User.findOne({ phone });

    if (!user || user.deletedAt || !user.otp || !user.otpExpires) {
      return res.status(400).json({
        success: false,
        message: "Invalid OTP request",
      });
    }

    if (user.otpExpires < new Date()) {
      return res.status(400).json({
        success: false,
        message: "OTP expired",
      });
    }

    if (user.otpAttemptCount >= 5) {
      return res.status(429).json({
        success: false,
        message: "Too many failed attempts",
      });
    }

    if (hashOtp(otp) !== user.otp) {
      user.otpAttemptCount += 1;
      await user.save();

      return res.status(400).json({
        success: false,
        message: "Invalid OTP",
      });
    }

    user.otp = null;
    user.otpExpires = null;
    user.otpAttemptCount = 0;
    user.lastLoginAt = new Date();
    user.lastActiveAt = new Date();
    const clientSource = resolveClientSource(req);
    if (clientSource === "web") {
      user.clientSource = "web";
    } else if (clientSource === "android" || clientSource === "ios") {
      user.clientSource = clientSource;
    } else if (!user.clientSource || user.clientSource === "unknown") {
      user.clientSource = clientSource;
    }

    const onboardingRequired = !isProfileComplete(user);
    const isWeb = isWebClient(req);

    if (isWeb) {
      const refreshId = generateRefreshId();
      setClientRefreshId(user, resolveClientAppKey(req), refreshId);
      await user.save();

      const tokenPayload = {
        id: user._id,
        role: user.role,
        phone: user.phone,
        organization: user.organization,
      };
      const accessToken = signAccessToken({
        ...tokenPayload,
        onboardingRequired,
      });
      const refreshToken = signRefreshToken(tokenPayload, refreshId);
      setRefreshCookie(res, refreshToken, req);

      return res.status(200).json({
        success: true,
        message: "Login successful",
        accessToken,
        refreshToken,
        role: user.role,
        onboardingRequired,
        user: {
          id: user._id,
          email: user.email,
          phone: user.phone,
          role: user.role,
          firstName: user.firstName,
          lastName: user.lastName,
          country: user.country,
        },
        data: {
          accessToken,
          user,
          onboardingRequired,
        },
      });
    }

    await user.save();

    const payload = {
      id: user._id,
      role: user.role,
      phone: user.phone,
      organization: user.organization,
    };

    const accessToken = jwt.sign(payload, process.env.JWT_ACCESS_SECRET, {
      expiresIn: "15d",
    });

    return res.status(200).json({
      success: true,
      message: "Login successful",
      data: {
        accessToken,
        user,
      },
    });
  } catch (error) {
    console.error("Verify OTP Error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

/* ================= RESEND OTP ================= */

export const resendWhatsappOtp = async (req, res) => {
  try {
    const { phone } = req.body;

    const phoneRegex = /^\+\d{8,15}$/;
    if (!phoneRegex.test(phone)) {
      return res.status(400).json({
        success: false,
        message: "Phone must be in +<countrycode><number> format",
      });
    }

    const user = await User.findOne({ phone });
    if (!user || user.deletedAt) {
      return res.status(404).json({
        success: false,
        message: "User does not exist",
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
    await sendWhatsappOtpTemplate(phone, otp, user.language);

    user.otp = hashOtp(otp);
    user.otpExpires = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);
    user.lastOtpSentAt = new Date();
    user.otpAttemptCount = 0;
    await user.save();

    return res.status(200).json({
      success: true,
      message: "OTP resent successfully",
    });
  } catch (error) {
    console.error("Resend OTP Error:", error?.response?.data || error);
    return res.status(500).json({
      success: false,
      message: "Failed to resend OTP",
    });
  }
};
