import axios from "axios";

const GRAPH_URL = `https://graph.facebook.com/v18.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;

export const sendWhatsAppTemplate = async ({
  to,
  templateName,
  languageCode = "en",
  parameters = [],
}) => {
  if (!to) throw new Error("Phone number is required");
  if (!templateName) throw new Error("Template name is required");

  return axios.post(
    GRAPH_URL,
    {
      messaging_product: "whatsapp",
      to,
      type: "template",
      template: {
        name: templateName,
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
        Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
    },
  );
};
