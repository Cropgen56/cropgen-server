import { sendBasicEmail } from "../../../config/sesClient.js";
import User from "../../../models/user.model.js";
import {
  crmInvitationEmailHtml,
  crmInvitationEmailText,
  crmLoginInstructionsEmailHtml,
  crmLoginInstructionsEmailText,
} from "../templates/crmInvitationEmails.js";
import { buildCrmLoginUrl, buildInvitationAcceptUrl } from "../utils/invitationToken.js";

function maskPhone(phone) {
  if (!phone) return "";
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 4) return phone;
  return `+${digits.startsWith("91") ? "91 " : ""}******${digits.slice(-4)}`;
}

export async function sendCrmInvitationEmail({
  to,
  inviteeName,
  inviterName,
  roleLevel,
  token,
  expiresAt,
}) {
  const acceptUrl = buildInvitationAcceptUrl(token);

  return sendBasicEmail({
    to,
    subject: "Verify your Satagro CRM invitation",
    html: crmInvitationEmailHtml({
      inviteeName,
      inviterName,
      roleLevel,
      acceptUrl,
      expiresAt,
    }),
    text: crmInvitationEmailText({
      inviteeName,
      roleLevel,
      acceptUrl,
    }),
    preset: "biodrops",
  });
}

export async function sendCrmLoginInstructionsEmail({ to, userId }) {
  const user = await User.findById(userId).select("firstName lastName phone email");
  const inviteeName = [user?.firstName, user?.lastName].filter(Boolean).join(" ").trim();
  const loginUrl = buildCrmLoginUrl();

  return sendBasicEmail({
    to,
    subject: "How to sign in to Satagro CRM",
    html: crmLoginInstructionsEmailHtml({
      inviteeName: inviteeName || user?.email,
      phoneMasked: maskPhone(user?.phone),
      loginUrl,
    }),
    text: crmLoginInstructionsEmailText({
      inviteeName: inviteeName || user?.email,
      loginUrl,
      phoneMasked: maskPhone(user?.phone),
    }),
    preset: "biodrops",
  });
}
