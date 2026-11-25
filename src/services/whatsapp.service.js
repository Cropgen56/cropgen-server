import axios from "axios";
import { isBiodropsOrganizationCode } from "../utils/organization/biodropsOrganization.js";

// Map internal notification template names to WhatsApp Business template names (CropGen number)
const WHATSAPP_TEMPLATE_NAME_MAP = {
  plan_expiry_reminder_notification:
    "plan_expiry_reminder_notification_utility",
  advisory: "advisory",
  farm_advisory: "farm_advisory",
};

// Satagro (BioDrops) number: its own phone id/token and its own "satagro_" templates
const SATAGRO_TEMPLATE_NAME_MAP = {
  advisory: "satagro_advisory",
  plan_expiry_reminder_notification:
    "satagro_plan_expiry_reminder_notification_utility",
  plan_activation_notification: "satagro_plan_activation_notification",
};

function resolveSender(organizationCode) {
  if (isBiodropsOrganizationCode(organizationCode)) {
    return {
      phoneNumberId: process.env.BIODROPS_WHATSAPP_PHONE_NUMBER_ID,
      accessToken: process.env.BIODROPS_WHATSAPP_ACCESS_TOKEN,
      templateNames: SATAGRO_TEMPLATE_NAME_MAP,
    };
  }
  return {
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID,
    accessToken: process.env.WHATSAPP_ACCESS_TOKEN,
    templateNames: WHATSAPP_TEMPLATE_NAME_MAP,
  };
}

export const sendWhatsAppTemplate = async ({
  to,
  templateName,
  languageCode = "en",
  parameters = [],
  organizationCode,
}) => {
  if (!to) throw new Error("Phone number is required");
  if (!templateName) throw new Error("Template name is required");

  const sender = resolveSender(organizationCode);
  const resolvedTemplateName =
    sender.templateNames[templateName] || templateName;

  return axios.post(
    `https://graph.facebook.com/v18.0/${sender.phoneNumberId}/messages`,
    {
      messaging_product: "whatsapp",
      to,
      type: "template",
      template: {
        name: resolvedTemplateName,
        language: { code: languageCode },
        components: [
          {
            type: "body",
            parameters: parameters.map((text) => ({
              type: "text",
              text: String(text || ""),
            })),
          },
        ],
      },
    },
    {
      headers: {
        Authorization: `Bearer ${sender.accessToken}`,
        "Content-Type": "application/json",
      },
    },
  );
};
