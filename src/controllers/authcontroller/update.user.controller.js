import User from "../../models/user.model.js";
import Organization from "../../models/organization.model.js";

export const updateUserById = async (req, res) => {
  const { id } = req.params;
  let updateData = { ...req.body };

  try {
    /* ================= PHONE UNIQUE CHECK (OPTIONAL) ================= */
    if (updateData.phone) {
      const existingPhone = await User.findOne({
        phone: updateData.phone,
        _id: { $ne: id },
      });

      if (existingPhone) {
        return res.status(409).json({
          success: false,
          message: "Phone number is already in use by another account",
        });
      }
    }

    /* ================= ORGANIZATION HANDLING ================= */
    if (updateData.organizationCode) {
      const organization = await Organization.findOne({
        organizationCode: updateData.organizationCode.toUpperCase(),
      });

      if (!organization) {
        return res.status(404).json({
          success: false,
          message: `Organization '${updateData.organizationCode}' not found`,
        });
      }

      updateData.organization = organization._id;
      delete updateData.organizationCode;
    }

    /* ================= UPDATE USER ================= */
    const user = await User.findByIdAndUpdate(
      id,
      { $set: updateData },
      {
        new: true,
        runValidators: true,
        context: "query", // IMPORTANT for mongoose validators
      },
    ).populate({
      path: "organization",
      select: "organizationCode",
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "User updated successfully",
      user,
    });
  } catch (error) {
    console.error("Error updating user:", error);

    /* ================= DUPLICATE KEY SAFETY NET ================= */
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern || {})[0];

      return res.status(409).json({
        success: false,
        message: `${field} already exists`,
      });
    }

    return res.status(500).json({
      success: false,
      message: "Failed to update user",
    });
  }
};
