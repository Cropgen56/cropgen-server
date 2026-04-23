import { sendBasicEmail } from "../config/sesClient.js";
import { advisoryEmailTemplateFromNotification } from "../features/advisory/templates/advisoryEmail.template.js";
import { planActivationEmailTemplate } from "../templates/planActivationEmail.template.js";
import { planExpiryReminderEmailTemplate } from "../templates/planExpiryReminderEmail.template.js";
import { welcomeFarmEmailTemplate } from "../templates/welcomeFarmEmail.template.js";

export const sendEmail = async ({ to, subject, html }) => {
  return sendBasicEmail({
    to,
    subject,
    html,
    from: process.env.SES_FROM_EMAIL,
  });
};

export const generateEmailFromTemplate = (templateName, parameters, date) => {
  switch (templateName) {
    case "plan_activation_notification":
      return {
        subject: "Your CropGen Subscription is Activated ✅",
        html: planActivationEmailTemplate({
          parameters,
          createdAt: date,
        }),
      };

    case "plan_expiry_reminder_notification_utility":
      return {
        subject: "Your CropGen Subscription is Expiring Soon ⏳",
        html: planExpiryReminderEmailTemplate({
          parameters,
          createdAt: date,
        }),
      };

    // Advisory email uses the same template key as WhatsApp Manager: "farm_advisory"
    case "farm_advisory":
      return {
        subject: "CropGen Smart Farm Advisory",
        html: advisoryEmailTemplateFromNotification({
          parameters,
          createdAt: date,
        }),
      };

    case "welcome_farm_notification":
    case "cropgen_create_farm_reminder":
      return {
        subject: "Welcome to CropGen - Add Your Farm 🌱",
        html: welcomeFarmEmailTemplate({
          parameters,
        }),
      };

    default:
      return {
        subject: "Notification from CropGen",
        html: `<p>Please check your CropGen account.</p>`,
      };
  }
};
