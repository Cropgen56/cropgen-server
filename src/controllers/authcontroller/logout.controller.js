import User from "../../models/user.model.js";
import {
  verifyRefreshToken,
  clearRefreshCookie,
} from "../../utils/authUtils.js";

export const logoutHandler = async (req, res) => {
  try {
    const token = req.cookies?.refreshToken;
    if (token) {
      try {
        const decoded = verifyRefreshToken(token);
        const userId = decoded.id || decoded._id || decoded.userId;
        if (userId) {
          const user = await User.findById(userId);
          if (user) {
            user.refreshTokenId = null;
            await user.save();
          }
        }
      } catch (e) {}
    }

    clearRefreshCookie(res);
    return res.json({ success: true, message: "Logged out" });
  } catch (err) {
    console.error("logout error:", err);
    clearRefreshCookie(res);
    return res
      .status(500)
      .json({ success: false, message: "Failed to logout" });
  }
};
