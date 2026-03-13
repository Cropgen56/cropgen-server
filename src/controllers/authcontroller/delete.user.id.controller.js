import User from "../../models/user.model.js"
import Organization from "../../models/organization.model.js";


// Delete a user by ID
export const deleteUserById = async (req, res) => {
  const { id } = req.params;
  const requestingUser = req.user;

  try {
    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Check the role of the requesting user
    if (requestingUser.role === "client") {
      // For client: reassign user to organization with code "CROPGEN"
      if (
        !user.organization ||
        user.organization.toString() !== requestingUser.organization.toString()
      ) {
        return res.status(403).json({
          success: false,
          message: "You can only remove users from your own organization",
        });
      }

      // Find the CROPGEN organization
      const cropgenOrg = await Organization.findOne({
        organizationCode: "CROPGEN",
      });
      if (!cropgenOrg) {
        return res.status(404).json({
          success: false,
          message: "CROPGEN organization not found",
        });
      }

      // Reassign user to CROPGEN organization
      user.organization = cropgenOrg._id;
      await user.save();

      return res.status(200).json({
        success: true,
        message: "User reassigned to CROPGEN organization successfully",
        user,
      });
    } else if (["admin", "developer"].includes(requestingUser.role)) {
      // For admin or developer: perform hard delete
      await User.findByIdAndDelete(id);

      return res.status(200).json({
        success: true,
        message: "User permanently deleted successfully",
        user,
      });
    } else {
      return res.status(403).json({
        success: false,
        message: "Unauthorized to delete users",
      });
    }
  } catch (error) {
    console.error("Error processing user deletion:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to process user deletion",
      error: error.message,
    });
  }
};