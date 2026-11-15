/**
 * CropGen native mobile app access rules (Android and iOS only).
 *
 * The mobile app is for CropGen accounts only: existing accounts must belong
 * to the CROPGEN organization. Any country's mobile number may be used (India
 * sees the INR plan, other countries the USD plans).
 * Web and other clients are not affected.
 */

const NATIVE_APP_CLIENTS = ["cropgen_android", "cropgen_ios"];

export const CROPGEN_ORG_CODE = "CROPGEN";

export const INDIA_ONLY_MESSAGE =
  "The CropGen mobile app is available only for Indian mobile numbers (+91).";
export const CROPGEN_ONLY_APP_MESSAGE =
  "This account can't sign in to the CropGen mobile app.";
export const CROPGEN_ONLY_SIGNUP_MESSAGE =
  "Sign up in the CropGen mobile app is available for CropGen accounts only.";

export function isNativeCropgenAppRequest(req) {
  const clientApp = String(req?.headers?.["x-client-app"] || "").toLowerCase();
  return NATIVE_APP_CLIENTS.includes(clientApp);
}

export function isIndianPhone(phone) {
  return /^\+91\d{10}$/.test(String(phone || ""));
}

export function isCropgenOrgUser(user) {
  const code = String(user?.organization?.organizationCode || "").toUpperCase();
  return code === CROPGEN_ORG_CODE;
}
