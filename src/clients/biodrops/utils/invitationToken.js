import crypto from "crypto";

export function generateInvitationToken() {
  const token = crypto.randomBytes(32).toString("hex");
  const tokenHash = hashInvitationToken(token);
  return { token, tokenHash };
}

export function hashInvitationToken(token) {
  return crypto.createHash("sha256").update(String(token)).digest("hex");
}

export function getCrmAppBaseUrl() {
  return (
    process.env.SATAGRO_CRM_APP_URL ||
    process.env.CRM_ADMIN_APP_URL ||
    process.env.VITE_CRM_APP_URL ||
    "http://localhost:5173"
  ).replace(/\/$/, "");
}

export function buildInvitationAcceptUrl(token) {
  return `${getCrmAppBaseUrl()}/invite/accept/${token}`;
}

export function buildCrmLoginUrl() {
  return `${getCrmAppBaseUrl()}/login`;
}
