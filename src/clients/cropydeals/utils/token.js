import jwt from "jsonwebtoken";
import { ACCESS_TOKEN_EXPIRES } from "../constants.js";

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET;

export function signCropydealsAccessToken(payload) {
  return jwt.sign(payload, ACCESS_SECRET, {
    expiresIn: ACCESS_TOKEN_EXPIRES,
  });
}
