import jwt from "jsonwebtoken";
import {
  verifyRefreshToken,
  getRefreshTokenFromRequest,
  findActiveAuthUser,
  userDeletedPayload,
} from "../utils/auth/authUtils.js";

const JWT_SECRET = process.env.JWT_ACCESS_SECRET;

const isAuthenticated = async (req, res, next) => {
  const token = req.header("Authorization")?.split(" ")[1];

  if (!token) {
    return res
      .status(401)
      .json({ success: false, message: "Access denied. No token provided." });
  }

  try {
    const user = jwt.verify(token, JWT_SECRET);
    const active = await findActiveAuthUser(user.id || user._id);
    if (!active) {
      return res.status(401).json(userDeletedPayload());
    }
    req.user = {
      ...user,
      id: user.id || user._id,
      role: active.role || user.role,
      organization: active.organization || user.organization,
    };
    next();
  } catch {
    return res
      .status(401)
      .json({ success: false, message: "Invalid or expired token." });
  }
};

// Role-based authorization middleware
const authorizeRoles = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res
        .status(403)
        .json({ message: "Access denied. Unauthorized role." });
    }
    next();
  };
};

// protect the api with the api key
const checkApiKey = (req, res, next) => {
  const apiKey = req.headers["x-api-key"];
  const validApiKey = process.env.API_KEY;

  if (!apiKey || apiKey !== validApiKey) {
    return res.status(401).json({ error: "Unauthorized: Invalid API key" });
  }

  next();
};

const requireAuth = async (req, res, next) => {
  try {
    const hdr = req.headers.authorization || "";
    const accessToken = hdr.startsWith("Bearer ") ? hdr.slice(7) : null;
    const refreshToken = getRefreshTokenFromRequest(req);

    if (!accessToken && !refreshToken) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    // Preferred: short-lived access token from Authorization header.
    // Fallback: refresh token cookie for onboarding/profile completion paths
    // when frontend token state is temporarily unavailable.
    const payload = accessToken
      ? jwt.verify(accessToken, process.env.JWT_ACCESS_SECRET)
      : verifyRefreshToken(refreshToken);

    const active = await findActiveAuthUser(payload.id || payload._id);
    if (!active) {
      return res.status(401).json(userDeletedPayload());
    }

    req.auth = payload;
    next();
  } catch {
    return res.status(401).json({ success: false, message: "Invalid token" });
  }
};
export { isAuthenticated, authorizeRoles, checkApiKey, requireAuth };
