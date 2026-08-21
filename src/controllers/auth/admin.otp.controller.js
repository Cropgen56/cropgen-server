import { sendBasicEmail } from "../../config/sesClient.js";
import { genOtp, hash } from "../../utils/auth/authUtils.js";
import { htmlAdminOtp } from "../../utils/email/template.js";
import { canAccessAdminPanel, findAdminLoginUser, normalizeLoginEmail } from "../../utils/auth/orgScope.js";

export const requestAdminOtp = async (req, res) => {
  try {
    const email = normalizeLoginEmail(req.body?.email);
    if (!email)
      return res
        .status(400)
        .json({ success: false, message: "Email is required." });

    const user = await findAdminLoginUser(email);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "No account found with this email.",
      });
    }

    if (!canAccessAdminPanel(user)) {
      return res.status(403).json({
        success: false,
        message: "Access denied. This OTP is only for admin users.",
      });
    }

    // Throttle: 60s between sends
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

    await sendBasicEmail({
      to: email,
      subject: "CropGen Admin OTP - Secure Login",
      html: htmlAdminOtp(code, true),
      text: `ADMIN OTP: ${code}\nThis is a privileged login. Expires in 10 minutes.`,
    });

    return res.json({
      success: true,
      message: "Admin OTP sent successfully.",
      hint: "Check your email for secure admin access.",
    });
  } catch (err) {
    if (err.code === "EmailNotVerified") {
      return res.status(400).json({ success: false, message: err.message });
    }
    console.error("requestAdminOtp error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to send admin OTP.",
    });
  }
};
