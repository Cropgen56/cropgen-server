import User from "../../models/user.model.js";
import { sendBasicEmail } from "../../config/sesClient.js";
import { genOtp, hash } from "../../utils/authUtils.js";
import { htmlOtp } from "../../utils/emailTemplate.js";

export const requestOtp = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email)
      return res
        .status(400)
        .json({ success: false, message: "Email is required." });

    let user = await User.findOne({ email });

    
// create placeholder if missing (no org yet)
if (!user) {
  user = await User.create({
    email,
    terms: false,
    role: "farmer",
    clientSource: "web",
  });
} else {
  // Backfill clientSource for legacy users
  if (!user.clientSource || user.clientSource === "unknown") {
    user.clientSource = "web";
    await user.save(); 
  }
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

    await sendBasicEmail({
      to: email,
      subject: "Your CropGen OTP",
      html: htmlOtp(code),
      text: `Your CropGen OTP is ${code}. It expires in 10 minutes.`,
    });

    return res.json({ success: true, message: "OTP sent to email." });
  } catch (err) {
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
