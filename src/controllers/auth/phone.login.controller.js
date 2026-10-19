import jwt from "jsonwebtoken";
import User from "../../models/user.model.js"
import Organization from "../../models/organization.model.js";
import { resolveClientSource } from "../../utils/auth/authUtils.js";

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

export const loginWithPhone = async (req, res) => {
  const { phone } = req.body;

  try {
    // Validate phone format
    const phoneRegex = /^\+\d{8,15}$/;
    if (!phone || !phoneRegex.test(phone)) {
      return res.status(400).json({
        success: false,
        message: "Phone number must be in +<countrycode><number> format",
        data: null,
      });
    }

    // Check if user exists
    let user = await User.findOne({ phone });
    if (user?.deletedAt) {
      return res.status(404).json({
        success: false,
        message: "User does not exist",
        data: null,
      });
    }

    const resolvedSource = resolveClientSource(req);
    if (user) {
      let changed = false;
      if (resolvedSource === "web") {
        if (user.clientSource !== "web") {
          user.clientSource = "web";
          changed = true;
        }
      } else if (resolvedSource === "android" || resolvedSource === "ios") {
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

    if (!user) {
      // Find default organization
      const orgCode = "CROPGEN";
      const organization = await Organization.findOne({
        organizationCode: orgCode,
      });

      if (!organization) {
        return res.status(404).json({
          success: false,
          message: `Default organization '${orgCode}' not found.`,
          data: null,
        });
      }

      // Create new user with default values
      user = await createUserByPhoneSafe({
        firstName: "User",
        lastName: "",
        phone,
        role: "farmer",
        terms: true,
        organization: organization?._id,
        clientSource: resolvedSource,
      });
    }

    // Generate JWT for login
    const payload = {
      id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      role: user.role,
      organization: user.organization,
    };

    const accessToken = jwt.sign(payload, process.env.JWT_ACCESS_SECRET, {
      expiresIn: "15d",
    });

    return res.status(200).json({
      success: true,
      message: user.lastName
        ? "User login successful"
        : "User registered and logged in successfully",
      data: { accessToken, user },
    });
  } catch (error) {
    console.error("Login Error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
      data: null,
    });
  }
};
