import User from "../../models/user.model.js"
import Organization from "../../models/organization.model.js";
import { revokeAllRefreshSessions } from "../../utils/auth/authUtils.js";
import { isOrgScopedAdmin, organizationIdOf } from "../../utils/auth/orgScope.js";


// Delete a user by ID
export const deleteUserById = async (req, res) => {
  const { id } = req.params;
  const requestingUser = req.user;

  try {
    const user = await User.findById(id);
    if (!user || user.deletedAt) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Check the role of the requesting user
    if (requestingUser.role === "client" || isOrgScopedAdmin(requestingUser)) {
      // For client: reassign user to organization with code "CROPGEN"
      if (
        !user.organization ||
        user.organization.toString() !== String(organizationIdOf(requestingUser) || requestingUser.organization)
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
      // Soft-delete so existing web sessions and Google/phone login are revoked.
      user.deletedAt = new Date();
      revokeAllRefreshSessions(user);
      await user.save();

      return res.status(200).json({
        success: true,
        message: "User deleted successfully",
        user: { id: user._id, email: user.email, phone: user.phone },
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