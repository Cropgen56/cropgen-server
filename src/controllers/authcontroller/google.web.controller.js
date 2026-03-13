import User from "../../models/user.model.js";
import { OAuth2Client } from "google-auth-library";
import {
  generateRefreshId,
  signAccessToken,
  signRefreshToken,
  setRefreshCookie,
  resolveOrganizationByCode,
} from "../../utils/authUtils.js";
import { sendBasicEmail } from "../../config/sesClient.js";
import { htmlWelcomeBack, htmlWelcome } from "../../utils/emailTemplate.js";
import mongoose from "mongoose";

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

export const loginWithGoogleWeb = async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res
        .status(400)
        .json({ success: false, message: "Google token is required." });
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
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    const { email, name, picture, sub } = payload;

    // Split full name into first and last name
    const nameParts = name.split(" ");
    const firstName = nameParts[0];
    const lastName = nameParts.slice(1).join(" ") || "";

    // Resolve organization
    const { org: organization, orgCode } = await resolveOrganizationByCode(
      "CROPGEN"
    );

    // Check if user exists
    let user = await User.findOne({ email }).populate("organization");
    const isExisting = !!user && !!user.organization && user.terms === true;

   // Backfill clientSource for existing users if missing or invalid
    if (
     user &&
   (!user.clientSource || user.clientSource === "unknown")
) {
  user.clientSource = "web";
}

    // Prepare email details based on user status
    const emailDetails = isExisting
      ? {
          to: email,
          subject: "Signed in to CropGen",
          html: htmlWelcomeBack(user.firstName || user.email),
          text: "You're signed in to CropGen.",
          errorMessage: "Welcome back email error:",
        }
      : {
          to: email,
          subject: "Welcome to CropGen",
          html: htmlWelcome(firstName || "Farmer"),
          text: "Thank you for registering with CropGen!",
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
        clientSource: "web"
      });
    }

    // Send appropriate email (non-critical)
    try {
      await sendBasicEmail({
        to: emailDetails.to,
        subject: emailDetails.subject,
        html: emailDetails.html,
        text: emailDetails.text,
      });
    } catch (e) {
      console.error(emailDetails.errorMessage, e);
    }

    // Generate refreshId and update user
    const refreshId = generateRefreshId();
    user.refreshTokenId = refreshId;
    if (isExisting) user.lastLoginAt = new Date();
    await user.save();

    // Minimal payload for access token
    const tokenPayload = {
      id: user._id,
      role: user.role,
      organization: user.organization,
    };

    const onboardingRequired = !isExisting;
    const accessToken = signAccessToken({
      ...tokenPayload,
      onboardingRequired,
    });
    const refreshToken = signRefreshToken(tokenPayload, refreshId);

    // Set HttpOnly refresh cookie
    setRefreshCookie(res, refreshToken);

    return res.json({
      success: true,
      message: isExisting
        ? "Signed in successfully"
        : "Google login successful",
      accessToken,
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
  } catch (error) {
    console.error("loginWithGoogleWeb:", error.message, error.stack);
    return res.status(error.status || 500).json({
      success: false,
      message: error.message || "Internal server error.",
    });
  }
};
