import User from "../../models/user.model.js";
import { logActivity } from "../../utils/storage/activityLog.service.js";
import {
  isOrgScopedAdmin,
  organizationIdOf,
  canAccessAdminPanel,
} from "../../utils/auth/orgScope.js";
import {
  revokeAllRefreshSessions,
} from "../../utils/auth/authUtils.js";


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

    // Make sure requester has admin access
    if (!canAccessAdminPanel(requestingUser)) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized to delete users",
      });
    }

    /*
     * CLIENT / ORGANIZATION-SCOPED ADMIN
     * ----------------------------------
     * Can only delete users belonging to their own organization.
     */
    if (
      requestingUser.role === "client" ||
      isOrgScopedAdmin(requestingUser)
    ) {
      const requesterOrgId =
        organizationIdOf(requestingUser) ||
        requestingUser.organization;

      if (
        !user.organization ||
        String(user.organization) !== String(requesterOrgId)
      ) {
        return res.status(403).json({
          success: false,
          message:
            "You can only delete users from your own organization.",
        });
      }

      // Save information before soft deletion
      const deletedUserEmail = user.email;
      const deletedUserName =
        user.firstName ||
        user.email ||
        String(user._id);

      // Soft delete
      user.deletedAt = new Date();

      // Revoke existing sessions
      revokeAllRefreshSessions(user);

      await user.save();

      // Activity log
      await logActivity({
        userId: requestingUser._id,
        userName:
          requestingUser.email ||
          requestingUser.firstName ||
          "Unknown",
        action: "DELETE",
        module: "Farmers",
        description: `Deleted farmer ${deletedUserName}`,
        status: "SUCCESS",
      });

      return res.status(200).json({
        success: true,
        message: "Farmer deleted successfully",
        user: {
          id: user._id,
          email: deletedUserEmail,
        },
      });
    }

    /*
     * GLOBAL ADMIN / DEVELOPER
     */
    if (
      requestingUser.role === "admin" ||
      requestingUser.role === "developer"
    ) {
      const deletedUserEmail = user.email;
      const deletedUserName =
        user.firstName ||
        user.email ||
        String(user._id);

      user.deletedAt = new Date();

      revokeAllRefreshSessions(user);

      await user.save();

      await logActivity({
        userId: requestingUser._id,
        userName:
          requestingUser.email ||
          requestingUser.firstName ||
          "Unknown",
        action: "DELETE",
        module: "Farmers",
        description: `Deleted farmer ${deletedUserName}`,
        status: "SUCCESS",
      });

      return res.status(200).json({
        success: true,
        message: "User deleted successfully",
        user: {
          id: user._id,
          email: deletedUserEmail,
          phone: user.phone,
        },
      });
    }

    return res.status(403).json({
      success: false,
      message: "Unauthorized to delete users",
    });
  } catch (error) {
    console.error("Error processing user deletion:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to process user deletion",
      error: error.message,
    });
  }
};