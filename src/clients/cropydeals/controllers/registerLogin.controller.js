import User from "../../../models/user.model.js";
import Organization from "../../../models/organization.model.js";
import { DEFAULT_CLIENT_SOURCE } from "../constants.js";
import { signCropydealsAccessToken } from "../utils/token.js";

/**
 * POST /v1/api/auth/cropydeal-register-login
 * Register or log in a CropyDeals webview user (organization from body).
 */
export const cropydealsRegisterLogin = async (req, res) => {
  try {
    const { firstName, lastName, phone, email, organizationCode, terms } =
      req.body;

    if (!phone || !organizationCode || terms === undefined) {
      return res.status(400).json({
        error:
          "Phone number, organization code, and terms acceptance are required",
      });
    }

    if (!/^\+\d{8,15}$/.test(phone)) {
      return res.status(400).json({ error: "Invalid phone number format" });
    }

    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: "Invalid email format" });
    }

    if (typeof terms !== "boolean" || !terms) {
      return res.status(400).json({ error: "You must accept the terms" });
    }

    const organization = await Organization.findOne({
      organizationCode: organizationCode.toUpperCase(),
    });

    if (!organization) {
      return res.status(400).json({ error: "Invalid organization code" });
    }

    let user = await User.findOne({ phone });

    if (user) {
      if (!user.clientSource || user.clientSource === "unknown") {
        user.clientSource = DEFAULT_CLIENT_SOURCE;
      }

      user.lastLoginAt = new Date();
      await user.save();

      const payload = {
        id: user._id,
        email: user.email || null,
        role: user.role,
        organization: user.organization,
      };

      const accessToken = signCropydealsAccessToken(payload);

      return res.status(200).json({
        message: "Login successful",
        accessToken,
        user: {
          id: user._id,
          firstName: user.firstName,
          lastName: user.lastName,
          phone: user.phone,
          email: user.email,
          role: user.role,
          organization: user.organization,
          subscriptionStatus: user.subscriptionStatus,
        },
      });
    }

    user = new User({
      firstName,
      lastName,
      phone,
      email,
      organization: organization._id,
      terms,
      role: "farmer",
      lastLoginAt: new Date(),
      clientSource: DEFAULT_CLIENT_SOURCE,
    });

    await user.save();

    const payload = {
      id: user._id,
      email: user.email || null,
      role: user.role,
      organization: user.organization,
    };

    const accessToken = signCropydealsAccessToken(payload);

    return res.status(201).json({
      message: "Registration successful",
      accessToken,
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        phone: user.phone,
        email: user.email,
        role: user.role,
        organization: user.organization,
        subscriptionStatus: user.subscriptionStatus,
      },
    });
  } catch (error) {
    if (error.code === 11000) {
      return res
        .status(400)
        .json({ error: "Phone number or email already exists" });
    }

    if (error.name === "ValidationError") {
      const errors = Object.values(error.errors).map((err) => err.message);
      return res
        .status(400)
        .json({ error: `Validation failed: ${errors.join(", ")}` });
    }

    console.error("Error in cropydealsRegisterLogin:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};
