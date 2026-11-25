import { sendBasicEmail } from "../config/sesClient.js";
import { advisoryEmailTemplateFromNotification } from "../features/advisory/templates/advisoryEmail.template.js";
import { planActivationEmailTemplate } from "../templates/planActivationEmail.template.js";
import { planExpiryReminderEmailTemplate } from "../templates/planExpiryReminderEmail.template.js";
import { satagroAdvisoryEmailTemplate } from "../templates/satagro/satagroAdvisoryEmail.template.js";
import { satagroPlanActivationEmailTemplate } from "../templates/satagro/satagroPlanActivationEmail.template.js";
import { satagroPlanExpiryEmailTemplate } from "../templates/satagro/satagroPlanExpiryEmail.template.js";
import { isBiodropsOrganizationCode } from "../utils/organization/biodropsOrganization.js";

// Notifications store the internal name; the CropGen email switch uses the WhatsApp-manager name.
const CROPGEN_EMAIL_NAME_ALIASES = {
  plan_expiry_reminder_notification: "plan_expiry_reminder_notification_utility",
};

/**
 * Sends one email. Satagro (BIODROPS) mail goes out from the Satagro sender
 * (SES_FROM_EMAIL_BIODROPS); everything else uses the CropGen sender.
 */
export const sendEmail = async ({ to, subject, html, organizationCode }) => {
  if (isBiodropsOrganizationCode(organizationCode)) {
    return sendBasicEmail({ to, subject, html, preset: "biodrops" });
  }
  return sendBasicEmail({
    to,
    subject,
    html,
    from: process.env.SES_FROM_EMAIL,
  });
};

const generateSatagroEmail = (templateName, parameters, date) => {
  switch (templateName) {
    case "plan_activation_notification":
      return {
        subject: "Your Satagro Plan is Activated ✅",
        html: satagroPlanActivationEmailTemplate({ parameters, createdAt: date }),
      };

    case "plan_expiry_reminder_notification":
    case "plan_expiry_reminder_notification_utility":
      return {
        subject: "Your Satagro Plan is Expiring Soon ⏳",
        html: satagroPlanExpiryEmailTemplate({ parameters, createdAt: date }),
      };

    case "farm_advisory":
      return {
        subject: "Satagro Smart Farm Advisory",
        html: satagroAdvisoryEmailTemplate({ parameters, createdAt: date }),
      };

    default:
      return {
        subject: "Notification from Satagro",
        html: `<p>Please check your Satagro account.</p>`,
      };
  }
};

/**
 * Builds the subject and HTML for a notification email.
 * @param {string} templateName internal notification name
 * @param {Array} parameters notification parameters
 * @param {Date|string} [date]
 * @param {string} [organizationCode] CROPGEN, BIODROPS, ...
 */
export const generateEmailFromTemplate = (templateName, parameters, date, organizationCode) => {
  if (isBiodropsOrganizationCode(organizationCode)) {
    return generateSatagroEmail(templateName, parameters, date);
  }

  switch (CROPGEN_EMAIL_NAME_ALIASES[templateName] || templateName) {
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

    default:
      return {
        subject: "Notification from CropGen",
        html: `<p>Please check your CropGen account.</p>`,
      };
  }
};
