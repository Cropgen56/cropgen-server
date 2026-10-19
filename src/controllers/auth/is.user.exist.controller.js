import User from "../../models/user.model.js"


// check phone number is exist or not to send the otp
export const isUserExist = async (req, res) => {
  const { phone } = req.body;

  try {
    // Basic input validation
    if (!phone || typeof phone !== "string" || phone.trim() === "") {
      return res.status(400).json({
        success: false,
        message: "Phone number is required",
        data: null,
      });
    }

    // E.164-like phone format (+ and 8-15 digits)
    const phoneRegex = /^\+\d{8,15}$/;
    if (!phoneRegex.test(phone)) {
      return res.status(400).json({
        success: false,
        message: "Phone number must be in +<countrycode><number> format",
        data: null,
      });
    }

    // Check if user exists
    const user = await User.findOne({ phone });

    if (user) {
      return res.status(200).json({
        success: true,
        message: "User exists can process",
        data: { exists: true },
      });
    } else {
      return res.status(404).json({
        success: true,
        message: "User does not exist. Proceed with signup.",
        data: { exists: false },
      });
    }
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      data: null,
    });
  }
};
