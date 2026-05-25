import User from "../../models/user.model.js"
import Organization from "../../models/organization.model.js";


// mobile application api controller
export const checkUser = async (req, res) => {
  const { phone, organizationCode } = req.body;

  try {
    if (!phone) {
      return res.status(400).json({
        success: false,
        message: "Phone number is required",
        data: null,
      });
    }

    const user = await User.findOne({ phone });
    if (user) {
      return res.status(400).json({
        success: false,
        message: "User already registered",
        data: null,
      });
    }

    if (organizationCode) {
      const organization = await Organization.findOne({ organizationCode });
      if (!organization) {
        return res.status(400).json({
          success: false,
          message: "Invalid organization code",
          data: null,
        });
      }
    }

    return res.status(200).json({
      success: true,
      message: "User can proceed with signup",
      data: { allowed: true },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Server error",
      data: null,
    });
  }
};