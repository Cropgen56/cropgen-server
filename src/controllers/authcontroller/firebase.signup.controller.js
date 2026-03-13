import jwt from "jsonwebtoken";
import User from "../../models/user.model.js"
import Organization from "../../models/organization.model.js";
import admin from "firebase-admin";


// mobile singup api controller
export const signupWithFirebase = async (req, res) => {
  try {
    const { firstName, lastName, terms, organizationCode, idToken } = req.body;

    // Validate required fields
    if (!firstName || !idToken || terms !== true) {
      return res.status(400).json({
        success: false,
        message: "Required fields: firstName, idToken, terms",
      });
    }

    // Verify Firebase ID token
    let decodedToken;
    try {
      decodedToken = await admin.auth().verifyIdToken(idToken);
    } catch (error) {
      console.log(error);
      return res.status(401).json({
        success: false,
        message: "Invalid or expired ID token",
      });
    }

    const { phone_number, uid } = decodedToken;

    if (!phone_number) {
      return res.status(400).json({
        success: false,
        message: "Phone number not found in ID token",
      });
    }

    // Check for existing user
    const query = {
      $or: [{ firebaseUid: uid }, { phone: phone_number }],
    };

    const existingUser = await User.findOne(query);

    if (existingUser) {
        // Backfill clientSource if missing or unknown
  if (!existingUser.clientSource || existingUser.clientSource === "unknown") {
    existingUser.clientSource = "android";
    await existingUser.save();
  }
      return res.status(409).json({
        success: false,
        message: "User already exists.",
      });
    }

    // Handle organization code
    const orgCode = organizationCode
      ? organizationCode.toUpperCase()
      : "CROPGEN";

    const organization = await Organization.findOne({
      organizationCode: orgCode,
    });

    if (!organization) {
      return res.status(404).json({
        success: false,
        message: `Organization '${orgCode}' not found.`,
      });
    }

    // Create user
    const newUser = await User.create({
      firstName,
      lastName,
      phone: phone_number,
      role: "farmer",
      terms,
      organization: organization._id,
      firebaseUid: uid,
      clientSource: "android"
    });

    // Generate JWT Token for authentication
    const payload = {
      id: newUser._id,
      firstName: newUser.firstName,
      lastName: newUser.lastName,
      phone: newUser.phone,
      role: newUser.role,
      organization: newUser.organization,
      firebaseUid: newUser.firebaseUid,
    };
    const accessToken = jwt.sign(payload, process.env.JWT_ACCESS_SECRET, {
      expiresIn: "15d",
    });

    return res.status(201).json({
      success: true,
      message: "User registered successfully.",
      accessToken,
      user: {
        id: newUser._id,
        firstName: newUser.firstName,
        lastName: newUser.lastName,
        email: newUser.email,
        phone: newUser.phone,
        role: newUser.role,
        organizationCode: orgCode,
      },
    });
  } catch (error) {
    console.error("Signup Mobile Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error.",
      error: error.message,
    });
  }
};