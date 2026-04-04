/**
 * Auth / transactional email presets:
 * - `cropgen` — CropGen product (logo, classic green, CropGen URLs)
 * - `biodrops` — Bio Drops white-label (no CropGen logo by default; “email service by CropGen” in footer)
 *
 * Server default: `EMAIL_WHITELABEL=cropgen` (or `AUTH_EMAIL_BRAND`). Per-request: `X-Client-Brand: biodrops`
 * or JSON `clientBrand: "biodrops"` on auth routes. SES still sends via your CropGen-verified identity.
 */
const CROPGEN_LOGO =
  "https://cropgen-assets.s3.ap-south-1.amazonaws.com/cropgen/logo1.png";
const CROPGEN_OTP_ILLUSTRATION =
  "https://cropgen-assets.s3.ap-south-1.amazonaws.com/cropgen/hand-hold-mobile.png";

export function normalizeEnvPreset() {
  const v = String(
    process.env.EMAIL_WHITELABEL || process.env.AUTH_EMAIL_BRAND || "cropgen"
  ).toLowerCase();
  return v === "biodrops" ? "biodrops" : "cropgen";
}

/** Resolve `cropgen` vs `biodrops` for auth emails (header, body.clientBrand, then env). */
export function resolveAuthEmailPreset(req) {
  if (!req) return normalizeEnvPreset();
  const fromHeader = String(
    req.headers?.["x-client-brand"] || req.headers?.["X-Client-Brand"] || ""
  ).toLowerCase();
  const fromBody = String(req.body?.clientBrand || "").toLowerCase();
  if (fromHeader === "biodrops" || fromBody === "biodrops") return "biodrops";
  if (fromHeader === "cropgen" || fromBody === "cropgen") return "cropgen";
  return normalizeEnvPreset();
}

function buildCropgenBrand() {
  const appBase = (
    process.env.FRONTEND_URL ||
    process.env.EMAIL_APP_BASE_URL ||
    "https://app.cropgenapp.com"
  ).replace(/\/$/, "");
  const marketingBase = (
    process.env.EMAIL_MARKETING_BASE_URL ||
    "https://www.cropgenapp.com"
  ).replace(/\/$/, "");
  const logoFromEnv = process.env.EMAIL_BRAND_LOGO_URL;
  return {
    preset: "cropgen",
    name: process.env.EMAIL_BRAND_NAME || "CropGen",
    logoUrl: logoFromEnv ? String(logoFromEnv).trim() : CROPGEN_LOGO,
    accent: process.env.EMAIL_BRAND_ACCENT || "#246B27",
    footerBg: process.env.EMAIL_BRAND_FOOTER_BG || "#246B27",
    bodyBg: process.env.EMAIL_BODY_BG || "#f3f4f6",
    cardBg: process.env.EMAIL_CARD_BG || "#ffffff",
    text: process.env.EMAIL_TEXT_COLOR || "#0f172a",
    muted: process.env.EMAIL_MUTED_COLOR || "#475569",
    link: process.env.EMAIL_LINK_COLOR || "#246B27",
    footerLink: process.env.EMAIL_FOOTER_LINK_COLOR || "#ffffff",
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
      : CROPGEN_OTP_ILLUSTRATION,
    whiteLabelParent: null,
    cardShadowRgba: "36,107,39,0.12",
  };
}

function buildBiodropsBrand() {
  const appBase = (
    process.env.FRONTEND_URL ||
    process.env.EMAIL_APP_BASE_URL ||
    "https://www.biodrops.com"
  ).replace(/\/$/, "");
  const marketingBase = (
    process.env.EMAIL_MARKETING_BASE_URL ||
    "https://www.biodrops.com"
  ).replace(/\/$/, "");
  const logoFromEnv = process.env.EMAIL_BRAND_LOGO_URL;
  return {
    preset: "biodrops",
    name: process.env.EMAIL_BRAND_NAME || "Bio Drops",
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
    whiteLabelParent: "CropGen",
    cardShadowRgba: "11,93,61,0.12",
  };
}

/**
 * @param {"cropgen"|"biodrops"|undefined} preset - omit to use `EMAIL_WHITELABEL` / `AUTH_EMAIL_BRAND`
 */
export function getEmailBrand(preset) {
  const p =
    preset === "biodrops" || preset === "cropgen"
      ? preset
      : normalizeEnvPreset();
  return p === "biodrops" ? buildBiodropsBrand() : buildCropgenBrand();
}

function poweredByLine(b) {
  if (!b.whiteLabelParent) return "";
  return `<p style="margin:12px 0 0 0;font-size:10px;color:${b.footerLink};opacity:0.92;line-height:1.4;">Email service by ${b.whiteLabelParent}</p>`;
}

function poweredByLineWelcome(b) {
  if (!b.whiteLabelParent) return "";
  return `<p style="margin:12px 0 0 0;font-size:10px;color:rgba(255,255,255,0.88);line-height:1.4;">Email service by ${b.whiteLabelParent}</p>`;
}

/** OTP mail (login + signup). Pass `preset` from `resolveAuthEmailPreset(req)`. */
export const htmlOtp = (otp, preset) => {
  const b = getEmailBrand(preset);
  const logoRow = b.logoUrl
    ? `<img src="${b.logoUrl}" alt="" width="40" height="40"
                style="display:inline-block; border:0; vertical-align:middle; max-width:40px; height:auto;" />`
    : "";
  const logoSpacer = b.logoUrl ? "10px" : "0";
  const illustrationRow = b.otpIllustrationUrl
    ? `<tr>
                  <td align="center" style="padding:0 0 8px 0;">
                    <img src="${b.otpIllustrationUrl}" alt="" width="88" height="auto" style="display:block; border:0; margin:0 auto; opacity:0.92;" />
                  </td>
                </tr>`
    : "";
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Verification code — ${b.name}</title>
  <style>
    @media only screen and (max-width:480px) {
      .bd-container { width:100% !important; }
      .bd-inner { padding:24px 18px !important; }
      .bd-headline { font-size:24px !important; }
    }
  </style>
</head>
<body style="margin:0; padding:0; background:${b.bodyBg}; font-family:'Segoe UI',Arial,Helvetica,sans-serif; -webkit-text-size-adjust:none;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" bgcolor="${b.bodyBg}">
    <tr>
      <td align="center" style="padding:32px 12px;">
        <table class="bd-container" width="560" border="0" cellspacing="0" cellpadding="0"
          style="width:560px; max-width:560px; border-radius:12px; overflow:hidden; background:${b.cardBg}; box-shadow:0 4px 24px rgba(${b.cardShadowRgba});">
          <tr>
            <td style="height:4px; background:${b.accent}; font-size:0; line-height:0;">&nbsp;</td>
          </tr>
          <tr>
            <td class="bd-inner" style="padding:28px 28px 8px 28px; text-align:center;">
              ${logoRow}
              <div style="margin-top:${logoSpacer}; font-size:20px; font-weight:700; color:${b.accent}; letter-spacing:-0.02em;">
                ${b.name}
              </div>
            </td>
          </tr>
          <tr>
            <td class="bd-inner" style="padding:8px 28px 28px 28px;">
              <h1 class="bd-headline" style="margin:0 0 16px 0; font-size:28px; font-weight:800; color:${b.accent}; text-align:center; line-height:1.25;">
                Your ${b.name} verification code
              </h1>
              <p style="margin:0 0 8px 0; font-size:15px; color:${b.text}; text-align:center;">Hello,</p>
              <p style="margin:0 0 24px 0; font-size:15px; color:${b.muted}; text-align:center; line-height:1.6;">
                Use this one-time code to sign in or finish setting up your <strong style="color:${b.text};">${b.name}</strong> account. It expires in 10 minutes.
              </p>
              <table width="100%" border="0" cellspacing="0" cellpadding="0" role="presentation">
                <tr>
                  <td align="center" style="padding:0 0 20px 0;">
                    <table border="0" cellspacing="0" cellpadding="0" style="margin:0 auto;">
                      <tr>
                        <td style="background:#f8faf9; border:2px solid ${b.accent}; border-radius:12px; padding:18px 36px; font-size:28px; font-weight:800; color:${b.text}; letter-spacing:6px; font-family:Consolas,'Courier New',monospace;">
                          ${otp}
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                ${illustrationRow}
              </table>
              <p style="margin:16px 0 0 0; font-size:13px; color:${b.muted}; text-align:center; line-height:1.5;">
                If you didn’t request this code, you can ignore this email or contact
                <a href="${b.helpUrl}" style="color:${b.link}; font-weight:600;">support</a>.
              </p>
            </td>
          </tr>
          <tr>
            <td style="background:${b.footerBg}; padding:20px 24px; text-align:center;">
              <p style="margin:0 0 10px 0; font-size:13px;">
                <a href="${b.dashboardUrl}" style="color:${b.footerLink}; text-decoration:none; font-weight:600;">Dashboard</a>
                <span style="color:${b.footerLink}; opacity:0.6;"> &nbsp;•&nbsp; </span>
                <a href="${b.billingUrl}" style="color:${b.footerLink}; text-decoration:none; font-weight:600;">Plans</a>
                <span style="color:${b.footerLink}; opacity:0.6;"> &nbsp;•&nbsp; </span>
                <a href="${b.helpUrl}" style="color:${b.footerLink}; text-decoration:none; font-weight:600;">Help</a>
              </p>
              <p style="margin:0; font-size:11px; color:${b.footerLink}; line-height:1.5; opacity:0.95;">
                You received this because a sign-in or sign-up was started with this address. Log in at
                <a href="${b.loginUrl}" style="color:${b.footerLink}; text-decoration:underline;">${b.loginUrl}</a>
                or create an account at
                <a href="${b.signupUrl}" style="color:${b.footerLink}; text-decoration:underline;">${b.signupUrl}</a>.
              </p>
              ${poweredByLine(b)}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
};

// Welcome — CropGen shows logo in header when preset is cropgen; Bio Drops is text-first unless EMAIL_BRAND_LOGO_URL is set.
export const htmlWelcome = (firstName, orgCode, preset) => {
  const b = getEmailBrand(preset);
  const headerLogo = b.logoUrl
    ? `<img src="${b.logoUrl}" alt="" width="40" height="40" style="display:block;margin:0 auto 10px;border:0;" />`
    : "";
  const fn = firstName || "there";
  const org =
    orgCode != null && String(orgCode).trim() !== ""
      ? `<p style="font-size:15px;line-height:24px;margin:0 0 16px 0;color:${b.muted};">You're now part of <strong style="color:${b.text};">${String(orgCode)}</strong>.</p>`
      : "";
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Welcome to ${b.name}</title>
</head>
<body style="margin:0; padding:0; background:${b.bodyBg}; font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background:${b.bodyBg}; padding:24px 0;">
    <tr>
      <td align="center">
        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width:640px; width:100%; background:${b.cardBg}; border-radius:8px; overflow:hidden; box-shadow:0 2px 6px rgba(0,0,0,0.08); box-sizing:border-box; margin:0 auto;">
          <tr>
            <td>
              <div style="background:${b.accent}; text-align:center; padding:24px; color:#fff;">
                ${headerLogo}
                <div style="font-size:22px; font-weight:700; letter-spacing:-0.02em;">${b.name}</div>
                <div style="border-top:1px solid rgba(255,255,255,0.35); width:150px; margin:12px auto;"></div>
                <h2 style="font-size:22px; font-weight:700; margin:0; margin-top:12px;">Welcome to ${b.name}</h2>
              </div>
              <div style="padding:40px 32px; text-align:center; color:${b.text};">
                <h1 style="font-size:28px; font-weight:700; margin:0 0 16px 0;">Hi there, ${fn}!</h1>
                ${org}
                <p style="font-size:16px; line-height:24px; margin:0 0 16px 0; color:${b.muted};">Thank you for joining ${b.name}. Let’s get started with smarter farming insights tailored just for you.</p>
                <p style="font-size:16px; line-height:24px; margin:0 0 16px 0; color:${b.muted};">You’ll experience practical field guidance — powered by AI, satellite insights, and recommendations tailored to your farms.</p>
                <a href="${b.loginUrl}" style="display:inline-block; background:${b.accent}; color:#fff; font-weight:600; font-size:16px; padding:14px 28px; border-radius:6px; text-decoration:none; margin-bottom:24px;">Get Started</a>
                <p style="font-size:14px; color:${b.accent}; line-height:20px; margin:0 0 20px 0;">Need help setting up your account? Our team is here to assist you. We’re excited to grow with you 🌱</p>
                <br>
                <p style="font-size:18px; font-weight:600; line-height:24px; margin:0 0 16px 0; color:${b.text};">${b.name}</p>
                <p style="font-weight:600; color:${b.text}; margin:4px 0 0 0;">Smarter farming starts here.</p>
              </div>
              <div style="background:${b.accent}; text-align:center; padding:16px;">
                <a href="${b.privacyUrl}" style="color:#fff; text-decoration:underline; margin:0 12px; font-size:13px;">Privacy Policy</a>
                <a href="${b.termsUrl}" style="color:#fff; text-decoration:underline; margin:0 12px; font-size:13px;">Terms & Conditions</a>
                <a href="${b.helpUrl}" style="color:#fff; text-decoration:underline; margin:0 12px; font-size:13px;">Contact Us</a>
                ${poweredByLineWelcome(b)}
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;
};

export const htmlWelcomeBack = (displayNameOrEmail, preset) => {
  const b = getEmailBrand(preset);
  const headerLogo = b.logoUrl
    ? `<img src="${b.logoUrl}" alt="" width="40" height="40" style="display:block;margin:0 auto 10px;border:0;" />`
    : "";
  const who = displayNameOrEmail || "there";
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Welcome back — ${b.name}</title>
</head>
<body style="margin:0; padding:0; background:${b.bodyBg}; font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background:${b.bodyBg}; padding:24px 0;">
    <tr>
      <td align="center">
        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width:640px; width:100%; background:${b.cardBg}; border-radius:8px; overflow:hidden; box-shadow:0 2px 6px rgba(0,0,0,0.08); box-sizing:border-box; margin:0 auto;">
          <tr>
            <td>
              <div style="background:${b.accent}; text-align:center; padding:24px; color:#fff;">
                ${headerLogo}
                <div style="font-size:22px; font-weight:700; letter-spacing:-0.02em;">${b.name}</div>
                <div style="border-top:1px solid rgba(255,255,255,0.35); width:150px; margin:12px auto;"></div>
                <h2 style="font-size:22px; font-weight:700; margin:0; margin-top:12px;">Welcome back</h2>
              </div>
              <div style="padding:40px 32px; text-align:center; color:${b.text};">
                <h1 style="font-size:28px; font-weight:700; margin:0 0 16px 0;">Hello again!</h1>
                <p style="font-size:16px; line-height:24px; margin:0 0 16px 0; color:${b.muted};">
                  We’re glad to see you back, <strong>${who}</strong>. Continue exploring your farm insights below.
                </p>
                <a href="${b.dashboardUrl}" style="display:inline-block; background:${b.accent}; color:#fff; font-weight:600; font-size:16px; padding:14px 28px; border-radius:6px; text-decoration:none; margin-bottom:24px;">Go to Dashboard</a>
                <br>
                <p style="font-size:16px; color:${b.accent}; line-height:24px; margin:0 0 16px 0;">Need help accessing your account? Contact us anytime.</p>
                <p style="font-size:16px; color:${b.accent}; font-weight:600; line-height:24px; margin:0 0 16px 0;">Happy farming!</p>
                <br>
                <p style="font-size:18px; font-weight:600; line-height:24px; margin:0 0 16px 0; color:${b.text};">${b.name}</p>
                <p style="font-weight:600; color:${b.text}; margin:4px 0 0 0;">Smarter farming starts here.</p>
              </div>
              <div style="background:${b.accent}; text-align:center; padding:16px;">
                <a href="${b.privacyUrl}" style="color:#fff; text-decoration:underline; margin:0 12px; font-size:13px;">Privacy Policy</a>
                <a href="${b.termsUrl}" style="color:#fff; text-decoration:underline; margin:0 12px; font-size:13px;">Terms & Conditions</a>
                <a href="${b.helpUrl}" style="color:#fff; text-decoration:underline; margin:0 12px; font-size:13px;">Contact Us</a>
                ${poweredByLineWelcome(b)}
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;
};

// successfully subscription email template
export const htmlSubscriptionSuccess = (
  userName,
  planName,
  hectares,
  amount,
  currency,
  startDate,
  nextBillingDate,
  paymentMethod = "Card",
  invoiceNumber = "CG/2025/INV-XXXXX"
) => {
  const formatDate = (date) => {
    return new Date(date).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  };

  const symbol = currency === "INR" ? "₹" : "$";
  const formattedAmount = `${symbol}${parseFloat(amount).toFixed(2)}`;
  const issuedDate = formatDate(new Date());
  const billingPeriod = `${formatDate(startDate)} – ${formatDate(
    nextBillingDate
  )}`;

  const finalInvoiceNumber = invoiceNumber.startsWith("CG/")
    ? invoiceNumber
    : `CG/${new Date().getFullYear()}/INV-${Math.floor(
        10000 + Math.random() * 90000
      )}`;

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>CropGen Invoice</title>
</head>
<body style="margin:0; padding:0; background:#f9fafb; font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background:#f9fafb; padding:20px 0;">
    <tr>
      <td align="center">

        <!-- View in Browser -->
        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width:600px; margin:0 auto 16px;">
          <tr>
            <td align="center" style="font-size:12px; color:#6b7280;">
              <a href="#" style="color:#345d13; text-decoration:underline;">View in browser</a>
            </td>
          </tr>
        </table>

        <!-- Main Card -->
        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width:600px; background:#ffffff; border-radius:12px; overflow:hidden; box-shadow:0 4px 12px rgba(0,0,0,0.05);">

          <!-- Green Header -->
          <tr>
            <td style="background:#246B27; padding:20px; text-align:center;">
              <img src="https://cropgen-assets.s3.ap-south-1.amazonaws.com/cropgen/logo1.png" alt="CropGen" width="36" height="36" style="display:inline-block; vertical-align:middle;" />
              <span style="color:#ffffff; font-size:20px; font-weight:600; margin-left:8px; vertical-align:middle;">CropGen</span>
            </td>
          </tr>

          <!-- Illustration -->
          <tr>
            <td style="padding:32px 40px 24px; text-align:center;">
              <img src="https://cropgen-assets.s3.ap-south-1.amazonaws.com/cropgen/invoice-illustration.png" alt="Payment Success" width="280" style="max-width:100%; height:auto; display:block; margin:0 auto;" />
            </td>
          </tr>

          <!-- Success Message -->
          <tr>
            <td style="padding:0 40px 16px; text-align:center;">
              <h1 style="font-size:28px; font-weight:700; color:#111827; margin:0 0 8px;">Your Payment Successful</h1>
              <p style="font-size:16px; color:#374151; margin:0 0 4px;">
                Thank you for your payment of <strong>${formattedAmount}</strong> on <strong>${issuedDate}</strong>
              </p>
              <p style="font-size:16px; color:#374151; margin:0;">Using ${paymentMethod}</p>
            </td>
          </tr>

          <!-- Dashed Line -->
          <tr>
            <td style="padding:0 40px;">
              <div style="border-bottom:2px dashed #86d72f; margin:20px 0;"></div>
            </td>
          </tr>

          <!-- Invoice Summary -->
          <tr>
            <td style="padding:0 40px 24px;">
              <p style="font-size:14px; font-weight:600; color:#111827; margin:0 0 12px;">Invoice Summary Box:</p>
              <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background:#f0fdf4; border-radius:8px; padding:16px; font-size:14px;">
                <tr>
                  <td style="padding:6px 0; color:#374151; width:50%;"><strong>Invoice No.</strong></td>
                  <td style="padding:6px 0; text-align:right; color:#111827; font-weight:600;">${finalInvoiceNumber}</td>
                </tr>
                <tr>
                  <td style="padding:6px 0; color:#374151;"><strong>Date Issued</strong></td>
                  <td style="padding:6px 0; text-align:right; color:#111827; font-weight:600;">${issuedDate}</td>
                </tr>
                <tr>
                  <td style="padding:6px 0; color:#374151;"><strong>Plan</strong></td>
                  <td style="padding:6px 0; text-align:right; color:#111827; font-weight:600;">${planName} - ${hectares} ha</td>
                </tr>
                <tr>
                  <td style="padding:6px 0; color:#374151;"><strong>Billing Period</strong></td>
                  <td style="padding:6px 0; text-align:right; color:#111827; font-weight:600;">${billingPeriod}</td>
                </tr>
                <tr>
                  <td style="padding:6px 0; color:#374151;"><strong>Amount Due</strong></td>
                  <td style="padding:6px 0; text-align:right; color:#111827; font-weight:600;">${formattedAmount}</td>
                </tr>
                <tr>
                  <td style="padding:6px 0; color:#374151;"><strong>Payment Status</strong></td>
                  <td style="padding:6px 0; text-align:right; color:#111827; font-weight:600;">Paid (${paymentMethod})</td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Download Button -->
          <tr>
            <td style="padding:0 40px 32px; text-align:center;">
              <a href="https://app.cropgenapp.com/dashboard-icon" style="display:inline-flex; align-items:center; gap:8px; background:#345F11; color:#ffffff; font-weight:600; font-size:16px; padding:12px 24px; border-radius:6px; text-decoration:none;">
                <img src="https://cropgen-assets.s3.ap-south-1.amazonaws.com/cropgen/download-icon.png" alt="Download" width="16" height="16" style="display:inline-block;" />
                Download Invoice PDF
              </a>
            </td>
          </tr>

          <!-- Tip -->
          <tr>
            <td style="padding:0 40px 24px; text-align:center; font-size:12px; color:#6b7280;">
              <strong>Tip:</strong> Add <strong>support@cropgenapp.com</strong> to your contacts to always see images.
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#246B27; color:#ffffff; padding:20px; text-align:center; font-size:13px;">
              <p style="margin:0 0 8px;">
                You can view and manage your invoices anytime from your CropGen Dashboard.<br>
                For queries, contact <a href="mailto:support@cropgenapp.com" style="color:#d8f0ff; text-decoration:underline;">support@cropgenapp.com</a>
              </p>
              <p style="margin:12px 0 0; font-size:12px;">
                This email was sent to you by <strong>CropGen</strong> – AI-Powered Crop Monitoring & Precision Farming
              </p>
              <p style="margin:16px 0 0;">
                <a href="https://app.cropgenapp.com/login" style="color:#d8f0ff; text-decoration:underline; margin:0 8px;">Visit Dashboard</a> |
                <a href="https://www.cropgenapp.com/contact" style="color:#d8f0ff; text-decoration:underline; margin:0 8px;">Contact us</a>
              </p>
            </td>
          </tr>
        </table>

        <!-- Footer Note -->
        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width:600px; margin:16px auto 0;">
          <tr>
            <td align="center" style="font-size:11px; color:#9ca3af;">
              © 2025 CropGen. All rights reserved.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
};

// admin otp email template
export const htmlAdminOtp = (code, userName = "Farmer") => {
  return `
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Confirm Verification Code</title>
  </head>
  <body style="margin:0;padding:0;background-color:#f9fafb;font-family:'Poppins',sans-serif;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#f9fafb;padding:40px 0;">
      <tr>
        <td align="center">
          <table cellpadding="0" cellspacing="0" border="0" width="600" style="background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;padding:30px 40px;box-sizing:border-box;">
            <tr>
              <td>

                <!-- Logo -->
                <div style="display:flex;align-items:center;gap:12px;margin-bottom:30px;">
                  <img src="https://cropgen-assets.s3.ap-south-1.amazonaws.com/cropgen/logo1.png" alt="CropGen Logo" style="width:57px;height:auto;vertical-align:middle;" />
                  <h2 style="font-size:18px;font-weight:600;color:#345d13;margin:0;display:inline-block;vertical-align:middle;">CropGen</h2>
                </div>

                <!-- Title -->
                <h2 style="font-size:32px;font-weight:bold;margin-bottom:25px;color:#000;">Confirm Verification Code</h2>

                <!-- Message -->
                <p style="font-size:15px;line-height:24px;font-weight:500;color:#000;margin-bottom:12px;">
                  Hello <strong>${userName || "Admin"}</strong>,
                </p>
                <p style="font-size:15px;line-height:24px;font-weight:500;color:#000;margin-bottom:12px;">
                  We received a request to log in to your CropGen Admin Account.
                </p>
                <p style="font-size:15px;line-height:24px;font-weight:500;color:#000;margin-bottom:12px;">
                  Please use the One-Time Password (OTP) below to complete your login:
                </p>

                <!-- OTP -->
                <div style="text-align:center;margin:30px 0;">
                  ${code
                    .split("")
                    .map(
                      (digit) => `
                      <span style="display:inline-block;width:55px;height:55px;border:2px solid #9a9898;border-radius:8px;font-size:28px;font-weight:700;color:#000;background:#effff7;line-height:55px;margin:0 8px;text-align:center;">
                        ${digit}
                      </span>`
                    )
                    .join("")}
                </div>

                <p style="font-size:15px;line-height:24px;font-weight:500;color:#000;margin-bottom:12px;">
                  This code is valid for 10 minutes and can be used only once.
                </p>
                <p style="font-size:15px;line-height:24px;font-weight:500;color:#000;margin-bottom:12px;">
                  If you didn’t initiate this login request, please ignore this email or contact our support team immediately.
                </p>

                <!-- Signature -->
                <div style="margin-top:25px;font-size:14px;color:#000;text-align:left;line-height:2;">
                  <p style="margin:0;">Stay secure,</p>
                  <p style="margin:0;"><strong>Team CropGen 🌾</strong></p>
                  <p style="margin:0;">
                    <a href="mailto:support@cropgenapp.com" style="color:#345d13;text-decoration:none;">support@cropgenapp.com</a>
                  </p>
                </div>

                <!-- Divider -->
                <div style="margin:30px 0;border-top:2px dashed #86d72f;"></div>

                <!-- Footer -->
                <footer>
                  <p style="margin:0 0 10px 0;font-size:15px;text-align:left;">
                    <strong>CropGen - AI + Satellite Intelligence for Smarter Farming</strong>
                  </p>
                  <p style="margin-top:20px;font-size:12px;font-style:italic;text-align:center;">
                    This email was sent to you by CropGen - AI-Powered Crop Monitoring & Precision Farming
                  </p>
                  <p style="margin-top:10px;font-size:14px;font-style:italic;text-align:center;">
                    <a href="https://app.cropgenapp.com/login" style="margin:0 10px;text-decoration:none;color:#000;font-weight:400;">Visit Dashboard</a> |
                    <a href="https://cropgenapp.com/contact" style="margin:0 10px;text-decoration:none;color:#000;font-weight:400;">Contact Us</a>
                  </p>
                </footer>

              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
`.trim();
};
