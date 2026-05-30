import User from "../../models/user.model.js";
import {
  verifyRefreshToken,
  clearRefreshCookie,
  signAccessToken,
  generateRefreshId,
  signRefreshToken,
  setRefreshCookie,
  getRefreshTokenFromRequest,
  resolveClientAppKey,
  getClientRefreshId,
  setClientRefreshId,
  clearClientRefreshId,
} from "../../utils/auth/authUtils.js";

export const refreshTokenHandler = async (req, res) => {
  try {
    const token = getRefreshTokenFromRequest(req);

    if (!token) {
      return res
        .status(401)
        .json({ success: false, message: "No refresh token" });
    }

    let decoded;
    try {
      decoded = verifyRefreshToken(token);
    } catch (err) {
      clearRefreshCookie(res, req);
      return res
        .status(403)
        .json({ success: false, message: "Invalid refresh token" });
    }

    const userId = decoded.id || decoded._id || decoded.userId;
    const tokenRid = decoded.rid;
    if (!userId || !tokenRid) {
      clearRefreshCookie(res, req);
      return res
        .status(403)
        .json({ success: false, message: "Invalid refresh token payload" });
    }

    const user = await User.findById(userId);
    const clientAppKey = resolveClientAppKey(req);
    const storedRid = getClientRefreshId(user, clientAppKey);

    if (!user || !storedRid) {
      clearRefreshCookie(res, req);
      return res
        .status(403)
        .json({ success: false, message: "Refresh token not recognized" });
    }

    if (storedRid !== tokenRid) {
      // token replay or revoked for this app only
      clearClientRefreshId(user, clientAppKey);
      await user.save();
      clearRefreshCookie(res, req);
      return res
        .status(403)
        .json({ success: false, message: "Refresh token revoked" });
    }

    // Rotate refresh id for better security
    const newRefreshId = generateRefreshId();
    setClientRefreshId(user, clientAppKey, newRefreshId);
    await user.save();

    const payload = {
      id: user._id,
      role: user.role,
      organization: user.organization,
    };
    const newAccessToken = signAccessToken(payload);
    const newRefreshToken = signRefreshToken(payload, newRefreshId);

    setRefreshCookie(res, newRefreshToken, req);

    // Include refresh JWT in JSON for cross-site clients (e.g. Safari) where cookies are not sent.
    return res.json({
      success: true,
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      user: { id: user._id, role: user.role, organization: user.organization },
    });
  } catch (err) {
    console.error("refreshToken error:", err);
    clearRefreshCookie(res, req);
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
};
