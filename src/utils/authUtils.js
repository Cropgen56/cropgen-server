import jwt from "jsonwebtoken";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import Organization from "../models/organization.model.js";

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET;
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET + "_r";
const ACCESS_EXPIRES = "1h";
const REFRESH_EXPIRES = "7d";
const REFRESH_COOKIE_NAME = "refreshToken";

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
export function setRefreshCookie(res, refreshToken) {
  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: "/",
  };

  res.cookie(REFRESH_COOKIE_NAME, refreshToken, cookieOptions);
}

export function clearRefreshCookie(res) {
  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    path: "/",
    maxAge: 0,
  };
  res.clearCookie(REFRESH_COOKIE_NAME, cookieOptions);
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
