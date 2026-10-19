import User from "../../models/user.model.js";
import {
  verifyRefreshToken,
  clearRefreshCookie,
  getRefreshTokenFromRequest,
  resolveClientAppKey,
  clearClientRefreshId,
} from "../../utils/auth/authUtils.js";
import { logActivity } from "../../utils/storage/activityLog.service.js";

export const logoutHandler = async (req, res) => {
  let loggedOutUser = null;

  try {
    const token = getRefreshTokenFromRequest(req);
    if (token) {
      try {
        const decoded = verifyRefreshToken(token);
        const userId = decoded.id || decoded._id || decoded.userId;
        if (userId) {
          const user = await User.findById(userId);
          if (user) {
            loggedOutUser = user;
            clearClientRefreshId(user, resolveClientAppKey(req));
            await user.save();
          }
        }
      } catch (e) {}
    }

    clearRefreshCookie(res, req);

try {
  await logActivity({
    userId: loggedOutUser?._id || null,
    userName:
      loggedOutUser?.email ||
      `${loggedOutUser?.firstName || ""} ${
        loggedOutUser?.lastName || ""
      }`.trim() ||
      "Unknown",
    action: "LOGOUT",
    module: "Authentication",
    description: "User logged out successfully",
    status: "SUCCESS",
  });
} catch (logError) {
  console.error(
    "Failed to record logout activity:",
    logError.message
  );
}

return res.json({ success: true, message: "Logged out" });
  } catch (err) {
    console.error("logout error:", err);
    try {
      await logActivity({
        userId: req.user?.id || req.user?._id || null,
        userName: req.user?.email || "Unknown",
        action: "LOGOUT",
        module: "Authentication",
        description: `Logout failed: ${err.message || "Unknown error"}`,
        status: "FAILED",
      });
    } catch (logError) {
      console.error(
        "Failed to record logout failure activity:",
        logError.message
      );
    }
    clearRefreshCookie(res, req);
    return res
      .status(500)
      .json({ success: false, message: "Failed to logout" });
  }
};
