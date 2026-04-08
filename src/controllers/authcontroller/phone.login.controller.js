import jwt from "jsonwebtoken";
import User from "../../models/user.model.js"
import Organization from "../../models/organization.model.js";

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
    const phoneRegex = /^\+91\d{10}$/;
    if (!phone || !phoneRegex.test(phone)) {
      return res.status(400).json({
        success: false,
        message: "Phone number must be in +91XXXXXXXXXX format",
        data: null,
      });
    }

    // Check if user exists
    let user = await User.findOne({ phone });

    if (user && (!user.clientSource || user.clientSource === "unknown")) {
    user.clientSource = "android";
     await user.save();
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
        clientSource: "android"
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
