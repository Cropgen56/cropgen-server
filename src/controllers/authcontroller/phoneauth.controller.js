import jwt from "jsonwebtoken";
import crypto from "crypto";
import axios from "axios";
import User from "../../models/user.model.js";
import Organization from "../../models/organization.model.js";
import { whatsappLanguageMap } from "../../utils/whatsapputility/whatsapplanguage.map.js";

/* ================= CONSTANTS ================= */

const OTP_EXPIRY_MINUTES = 10;
const OTP_RESEND_COOLDOWN = 60 * 1000;

const ALLOWED_LANGUAGES = ["en", "hi", "mr"];
const DEFAULT_LANGUAGE = "en";

/* ================= SEND OTP ================= */

export const sendWhatsappOtp = async (req, res) => {
  try {
    const { phone, language } = req.body;

    /* -------- Phone validation -------- */
    const phoneRegex = /^\+91\d{10}$/;
    if (!phoneRegex.test(phone)) {
      return res.status(400).json({
        success: false,
        message: "Phone must be in +91XXXXXXXXXX format",
      });
    }

    /* -------- Language normalization -------- */
    const normalizedLanguage = ALLOWED_LANGUAGES.includes(language)
      ? language
      : language
        ? DEFAULT_LANGUAGE
        : null;

    /* -------- Find or create user -------- */
    let user = await User.findOne({ phone });

    if (!user) {
      const organization = await Organization.findOne({
        organizationCode: "CROPGEN",
      });

      if (!organization) {
        return res.status(404).json({
          success: false,
          message: "Default organization not found",
        });
      }

      user = await User.create({
        phone,
        firstName: "User",
        role: "farmer",
        terms: true,
        organization: organization._id,
        clientSource: "android",
        language: normalizedLanguage,
      });
    }

    /* -------- Update language if provided -------- */
    if (normalizedLanguage && user.language !== normalizedLanguage) {
      user.language = normalizedLanguage;
    }

    /* -------- Rate limiting -------- */
    if (user.lastOtpSentAt) {
      const diff = Date.now() - new Date(user.lastOtpSentAt).getTime();
      if (diff < OTP_RESEND_COOLDOWN) {
        return res.status(429).json({
          success: false,
          message: "Please wait before requesting another OTP",
        });
      }
    }

    /* -------- Generate OTP -------- */
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpHash = crypto.createHash("sha256").update(otp).digest("hex");

    user.otp = otpHash;
    user.otpExpires = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);
    user.lastOtpSentAt = new Date();
    user.otpAttemptCount = 0;
    await user.save();

    /* -------- WhatsApp language -------- */
    const waLanguage =
      whatsappLanguageMap[user.language] || process.env.WHATSAPP_TEMPLATE_LANG;

    /* -------- Send WhatsApp OTP -------- */
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

    if (!user || !user.otp || !user.otpExpires) {
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

    const otpHash = crypto.createHash("sha256").update(otp).digest("hex");

    if (otpHash !== user.otp) {
      user.otpAttemptCount += 1;
      await user.save();

      return res.status(400).json({
        success: false,
        message: "Invalid OTP",
      });
    }

    /* -------- OTP success -------- */
    user.otp = null;
    user.otpExpires = null;
    user.otpAttemptCount = 0;
    user.lastLoginAt = new Date();
    user.lastActiveAt = new Date();
    await user.save();

    /* -------- JWT -------- */
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

    const phoneRegex = /^\+91\d{10}$/;
    if (!phoneRegex.test(phone)) {
      return res.status(400).json({
        success: false,
        message: "Phone must be in +91XXXXXXXXXX format",
      });
    }

    const user = await User.findOne({ phone });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
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

    const waLanguage =
      whatsappLanguageMap[user.language] || process.env.WHATSAPP_TEMPLATE_LANG;

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
