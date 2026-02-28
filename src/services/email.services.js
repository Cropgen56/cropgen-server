import { sendBasicEmail } from "../config/sesClient.js";

export const sendEmail = async ({ to, subject, html }) => {
  return sendBasicEmail({
    to,
    subject,
    html,
    from: process.env.SES_FROM_EMAIL,
  });
};
