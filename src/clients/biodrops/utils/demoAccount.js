import crypto from "crypto";

/** E.164 for India + 9999999999 — App Store / Play reviewer demo login */
export const BIODROPS_DEMO_PHONE = "+919999999999";

/** Static OTP shown in store listing / review notes */
export const BIODROPS_DEMO_OTP = "123456";

const DEMO_PHONE_SET = new Set([BIODROPS_DEMO_PHONE]);

export function isBiodropsDemoPhone(phone) {
  return DEMO_PHONE_SET.has(String(phone || "").trim());
}

export function biodropsDemoOtpHash() {
  return crypto
    .createHash("sha256")
    .update(BIODROPS_DEMO_OTP)
    .digest("hex");
}

export function isBiodropsDemoOtp(otp) {
  return String(otp || "").trim() === BIODROPS_DEMO_OTP;
}

/** Demo reviewer profile — onboarding skipped (terms already accepted). */
export const BIODROPS_DEMO_USER_PROFILE = {
  firstName: "Demo",
  lastName: "Reviewer",
  role: "farmer",
  terms: true,
  language: "en",
  country: "IN",
  state: "MH",
  city: "Pune",
  village: "Demo Farm",
};
