import jwt from "jsonwebtoken";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import Organization from "../models/organization.model.js";

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET;
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET + "_r";
const ACCESS_EXPIRES = "1h";
const REFRESH_EXPIRES = "7d";

/** Legacy single cookie — kept for backward compatibility until all clients send X-Client-App */
export const LEGACY_REFRESH_COOKIE_NAME = "refreshToken";

/**
 * Per-browser-tab / per-app refresh cookies so admin, cropgen web, and biodrops
 * do not overwrite each other on the same API host (e.g. localhost:7070).
 */
const CLIENT_APP_COOKIE_NAMES = {
  cropgen_web: "refreshToken_cropgen_web",
  admin: "refreshToken_admin",
  biodrops_web: "refreshToken_biodrops_web",
};

/** Production Origins → client app key (no header required) */
const PRODUCTION_ORIGIN_TO_CLIENT_APP = {
  "https://admin.cropgenapp.com": "admin",
  "https://app.cropgenapp.com": "cropgen_web",
  "https://biodrops.cropgenapp.com": "biodrops_web",
  "https://test.cropgenapp.com": "cropgen_web",
};

const CROPYDEALS_ACCESS_EXPIRES = "15d";

export const hash = (s) => bcrypt.hash(s, 10);
export const compare = (s, h) => bcrypt.compare(s, h);

export const genOtp = () => String(Math.floor(100000 + Math.random() * 900000));

export const resolveOrganizationByCode = async (codeRaw) => {
  const code =
    codeRaw && String(codeRaw).trim() !== ""
      ? String(codeRaw).toUpperCase().trim()
      : "CROPGEN";

  const org = await Organization.findOne({ organizationCode: code });

  if (!org) {
    const err = new Error(`Organization '${code}' not found.`);
    err.status = 404;
    throw err;
  }

  return { org, orgCode: code };
};

export function signAccessToken(payload) {
  return jwt.sign(payload, ACCESS_SECRET, { expiresIn: ACCESS_EXPIRES });
}

export function signRefreshToken(payload, refreshId) {
  return jwt.sign({ ...payload, rid: refreshId }, REFRESH_SECRET, {
    expiresIn: REFRESH_EXPIRES,
  });
}

export function signCropydealsAccessToken(payload) {
  return jwt.sign(payload, ACCESS_SECRET, {
    expiresIn: CROPYDEALS_ACCESS_EXPIRES,
  });
}

export function generateRefreshId() {
  return crypto.randomBytes(32).toString("hex");
}

function cookieBaseOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    path: "/",
  };
}

function cookieClearOptions() {
  return {
    ...cookieBaseOptions(),
    maxAge: 0,
  };
}

/**
 * Resolves which client app is calling (from X-Client-App or production Origin).
 * @returns {string|null} key in CLIENT_APP_COOKIE_NAMES or null
 */
export function resolveClientAppKey(req) {
  const raw = String(req.headers["x-client-app"] || "").trim().toLowerCase();
  if (raw && CLIENT_APP_COOKIE_NAMES[raw]) {
    return raw;
  }
  const origin = req.headers.origin;
  if (origin && PRODUCTION_ORIGIN_TO_CLIENT_APP[origin]) {
    return PRODUCTION_ORIGIN_TO_CLIENT_APP[origin];
  }
  return null;
}

export function getRefreshCookieNameForRequest(req) {
  const key = resolveClientAppKey(req);
  if (key && CLIENT_APP_COOKIE_NAMES[key]) {
    return CLIENT_APP_COOKIE_NAMES[key];
  }
  return LEGACY_REFRESH_COOKIE_NAME;
}

export function getRefreshTokenFromRequest(req) {
  const key = resolveClientAppKey(req);
  if (key && CLIENT_APP_COOKIE_NAMES[key]) {
    const name = CLIENT_APP_COOKIE_NAMES[key];
    if (req.cookies?.[name]) {
      return req.cookies[name];
    }
  }
  const legacy = req.cookies?.[LEGACY_REFRESH_COOKIE_NAME] || null;
  if (legacy) return legacy;

  const bodyTok =
    typeof req.body?.refreshToken === "string"
      ? req.body.refreshToken.trim()
      : "";
  return bodyTok || null;
}

export function setRefreshCookie(res, refreshToken, req) {
  const opts = {
    ...cookieBaseOptions(),
    maxAge: 7 * 24 * 60 * 60 * 1000,
  };
  const name = getRefreshCookieNameForRequest(req);
  res.cookie(name, refreshToken, opts);
  // Avoid two valid refresh tokens: drop legacy when issuing a scoped cookie
  if (name !== LEGACY_REFRESH_COOKIE_NAME) {
    res.clearCookie(LEGACY_REFRESH_COOKIE_NAME, cookieClearOptions());
  }
}

export function clearRefreshCookie(res, req) {
  const clearOpts = cookieClearOptions();
  const name = getRefreshCookieNameForRequest(req);
  res.clearCookie(name, clearOpts);
  if (name !== LEGACY_REFRESH_COOKIE_NAME) {
    res.clearCookie(LEGACY_REFRESH_COOKIE_NAME, clearOpts);
  }
}

export function verifyRefreshToken(token) {
  try {
    if (!token) {
      throw new Error("No token provided");
    }
    const decoded = jwt.verify(token, REFRESH_SECRET);
    return decoded;
  } catch (err) {
    console.error("Token Verification Error:", err.message);
    throw err;
  }
}
