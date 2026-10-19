import User from "../../models/user.model.js";
import { revokeAllRefreshSessions } from "../../utils/auth/authUtils.js";

export const deleteUserByEmail = async (req, res) => {
  const { email } = req.params;

  try {
    const user = await User.findOne({
      email: String(email || "").trim().toLowerCase(),
      deletedAt: null,
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    user.deletedAt = new Date();
    revokeAllRefreshSessions(user);
    await user.save();

    res.status(200).json({
      success: true,
      message: "User deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting user:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete user",
      error: error.message,
    });
  }
};
