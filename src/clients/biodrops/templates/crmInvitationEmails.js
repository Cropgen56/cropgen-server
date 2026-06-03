import { getEmailBrand } from "../../../utils/email/template.js";
import { buildCrmLoginUrl, buildInvitationAcceptUrl } from "../utils/invitationToken.js";

const LEVEL_LABELS = {
  super: "Super Admin",
  country: "Country Admin",
  state: "State User",
  district: "District Operator",
  ground: "FPO / Agent",
};

function emailShell({ brand, title, bodyHtml }) {
  const logoRow = brand.logoUrl
    ? `<img src="${brand.logoUrl}" alt="" width="44" height="44" style="display:block;margin:0 auto 12px;border:0;" />`
    : "";
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background:${brand.bodyBg};font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:${brand.bodyBg};padding:32px 12px;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:${brand.cardBg};border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(${brand.cardShadowRgba});">
          <tr><td style="height:4px;background:${brand.accent};font-size:0;">&nbsp;</td></tr>
          <tr>
            <td style="padding:28px 32px 8px;text-align:center;">
              ${logoRow}
              <div style="font-size:20px;font-weight:700;color:${brand.accent};">${brand.name} CRM</div>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 32px 28px;color:${brand.text};">
              ${bodyHtml}
            </td>
          </tr>
          <tr>
            <td style="background:${brand.footerBg};padding:18px 24px;text-align:center;">
              <p style="margin:0;font-size:12px;color:${brand.footerLink};line-height:1.5;">
                <a href="${brand.helpUrl}" style="color:${brand.footerLink};">Help</a>
                &nbsp;•&nbsp;
                <a href="${brand.privacyUrl}" style="color:${brand.footerLink};">Privacy</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/** Email 1: invitation with verification link */
export function crmInvitationEmailHtml({
  inviteeName,
  inviterName,
  roleLevel,
  acceptUrl,
  expiresAt,
}) {
  const brand = getEmailBrand("biodrops");
  const roleLabel = LEVEL_LABELS[roleLevel] || roleLevel;
  const expiryText = expiresAt
    ? new Date(expiresAt).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : "7 days";

  const bodyHtml = `
    <h1 style="margin:0 0 16px;font-size:24px;font-weight:800;color:${brand.accent};text-align:center;">
      You're invited to Satagro CRM
    </h1>
    <p style="font-size:15px;color:${brand.muted};line-height:1.6;text-align:center;">
      Hello <strong style="color:${brand.text};">${inviteeName || "there"}</strong>,
      ${inviterName ? `<br/>${inviterName} has invited you` : " You have been invited"} to join the team as
      <strong style="color:${brand.text};">${roleLabel}</strong>.
    </p>
    <p style="font-size:14px;color:${brand.muted};line-height:1.6;text-align:center;margin:20px 0;">
      Please verify your invitation to activate your account. This link expires on <strong>${expiryText}</strong>.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
      <tr>
        <td align="center" style="padding:8px 0 24px;">
          <a href="${acceptUrl}" style="display:inline-block;background:${brand.accent};color:#fff;font-weight:700;font-size:16px;padding:14px 32px;border-radius:8px;text-decoration:none;">
            Verify invitation
          </a>
        </td>
      </tr>
    </table>
    <p style="font-size:12px;color:${brand.muted};text-align:center;word-break:break-all;">
      Or copy this link:<br/>
      <a href="${acceptUrl}" style="color:${brand.link};">${acceptUrl}</a>
    </p>
    <p style="font-size:13px;color:${brand.muted};text-align:center;margin-top:20px;">
      If you did not expect this invitation, you can ignore this email.
    </p>
  `;

  return emailShell({
    brand,
    title: "Verify your Satagro CRM invitation",
    bodyHtml,
  });
}

/** Email 2: login instructions after verification */
export function crmLoginInstructionsEmailHtml({
  inviteeName,
  phoneMasked,
  loginUrl,
}) {
  const brand = getEmailBrand("biodrops");
  const url = loginUrl || buildCrmLoginUrl();

  const bodyHtml = `
    <h1 style="margin:0 0 16px;font-size:24px;font-weight:800;color:${brand.accent};text-align:center;">
      Your CRM access is ready
    </h1>
    <p style="font-size:15px;color:${brand.muted};line-height:1.6;text-align:center;">
      Hi <strong style="color:${brand.text};">${inviteeName || "there"}</strong>,
      your invitation has been verified. Use the steps below to sign in to Satagro CRM.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;background:#f8faf9;border-radius:10px;border:1px solid #e2e8f0;">
      <tr>
        <td style="padding:20px 24px;font-size:14px;color:${brand.text};line-height:1.8;">
          <strong>How to log in:</strong>
          <ol style="margin:12px 0 0;padding-left:20px;">
            <li>Open the CRM login page using the button below.</li>
            <li>Enter your mobile number${phoneMasked ? ` (<strong>${phoneMasked}</strong>)` : ""}.</li>
            <li>Tap <strong>Send OTP</strong> — you will receive a code on WhatsApp.</li>
            <li>Enter the OTP to complete sign-in.</li>
          </ol>
        </td>
      </tr>
    </table>
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
      <tr>
        <td align="center" style="padding:8px 0 16px;">
          <a href="${url}" style="display:inline-block;background:${brand.accent};color:#fff;font-weight:700;font-size:16px;padding:14px 32px;border-radius:8px;text-decoration:none;">
            Go to CRM login
          </a>
        </td>
      </tr>
    </table>
    <p style="font-size:12px;color:${brand.muted};text-align:center;">
      Login URL: <a href="${url}" style="color:${brand.link};">${url}</a>
    </p>
    <p style="font-size:13px;color:${brand.muted};text-align:center;margin-top:20px;">
      Need help? Contact your administrator or visit
      <a href="${brand.helpUrl}" style="color:${brand.link};">support</a>.
    </p>
  `;

  return emailShell({
    brand,
    title: "How to sign in to Satagro CRM",
    bodyHtml,
  });
}

export function crmInvitationEmailText({ inviteeName, roleLevel, acceptUrl }) {
  const roleLabel = LEVEL_LABELS[roleLevel] || roleLevel;
  return `Hello ${inviteeName || "there"},

You have been invited to Satagro CRM as ${roleLabel}.

Verify your invitation: ${acceptUrl}

If you did not expect this email, you can ignore it.`;
}

export function crmLoginInstructionsEmailText({ inviteeName, loginUrl, phoneMasked }) {
  const url = loginUrl || buildCrmLoginUrl();
  return `Hello ${inviteeName || "there"},

Your Satagro CRM invitation is verified. Sign in here: ${url}

Steps:
1. Open the login page
2. Enter your mobile number${phoneMasked ? ` (${phoneMasked})` : ""}
3. Request OTP on WhatsApp
4. Enter the OTP to sign in`;
}
