/** Biodrops white-label email brand (Satagro.ai URLs and styling). */
export function buildBiodropsBrand() {
  // NOTE: For white-label emails we do NOT use FRONTEND_URL (local dev),
  // because emails must always point to the public Satagro.ai URLs.
  const appBase = (
    process.env.EMAIL_APP_BASE_URL_BIODROPS ||
    process.env.EMAIL_APP_BASE_URL ||
    "https://satagro.ai"
  ).replace(/\/$/, "");
  const marketingBase = (
    process.env.EMAIL_MARKETING_BASE_URL_BIODROPS ||
    process.env.EMAIL_MARKETING_BASE_URL ||
    "https://satagro.ai"
  ).replace(/\/$/, "");
  const logoFromEnv =
    process.env.EMAIL_BRAND_LOGO_URL_BIODROPS || process.env.EMAIL_BRAND_LOGO_URL;
  return {
    preset: "biodrops",
    name: process.env.EMAIL_BRAND_NAME_BIODROPS || "Satagro.ai",
    logoUrl: logoFromEnv ? String(logoFromEnv).trim() : "",
    accent: process.env.EMAIL_BRAND_ACCENT || "#0B5D3D",
    footerBg: process.env.EMAIL_BRAND_FOOTER_BG || "#093A27",
    bodyBg: process.env.EMAIL_BODY_BG || "#e8f2ed",
    cardBg: process.env.EMAIL_CARD_BG || "#ffffff",
    text: process.env.EMAIL_TEXT_COLOR || "#0f172a",
    muted: process.env.EMAIL_MUTED_COLOR || "#475569",
    link: process.env.EMAIL_LINK_COLOR || "#0B5D3D",
    footerLink: process.env.EMAIL_FOOTER_LINK_COLOR || "#c8e8d4",
    appBase,
    marketingBase,
    helpUrl: process.env.EMAIL_HELP_URL || `${marketingBase}/contact`,
    billingUrl: process.env.EMAIL_BILLING_URL || marketingBase,
    dashboardUrl:
      process.env.EMAIL_DASHBOARD_URL || `${appBase}/cropgen-analytics`,
    loginUrl: process.env.EMAIL_LOGIN_URL || `${appBase}/login`,
    signupUrl: process.env.EMAIL_SIGNUP_URL || `${appBase}/signup`,
    privacyUrl:
      process.env.EMAIL_PRIVACY_URL || `${marketingBase}/privacy-policy`,
    termsUrl:
      process.env.EMAIL_TERMS_URL || `${marketingBase}/terms-conditions`,
    otpIllustrationUrl: process.env.EMAIL_OTP_ILLUSTRATION_URL
      ? String(process.env.EMAIL_OTP_ILLUSTRATION_URL).trim()
      : "",
    whiteLabelParent: null,
    cardShadowRgba: "11,93,61,0.12",
  };
}
