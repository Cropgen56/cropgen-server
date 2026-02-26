import axios from "axios";
import { TEMPLATE_MAP, LANGUAGE_MAP } from "../worker/utils/templateMap.js";

const WHATSAPP_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const GRAPH_URL = `https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/messages`;

const sanitize = (text = "") =>
  text
    .toString()
    .replace(/[\n\r\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export const sendAdvisoryTemplate = async ({
  user,
  farm,
  activity,
  advisory,
}) => {
  // ✅ Only allow en, hi, mr. Otherwise fallback to English
  const supportedLangs = ["en", "hi", "mr"];
  const userLang = supportedLangs.includes(user.language)
    ? user.language
    : "en";

  const whatsappLang = LANGUAGE_MAP[userLang] || "en";

  const templateName =
    TEMPLATE_MAP[activity.type]?.[userLang] ||
    TEMPLATE_MAP[activity.type]?.["en"];

  if (!templateName) {
    throw new Error(`Template not found for ${activity.type}`);
  }

  // ✅ Use advisory created date
  const advisoryDate = advisory?.createdAt
    ? new Date(advisory.createdAt).toLocaleDateString("en-IN")
    : new Date().toLocaleDateString("en-IN");

  let parameters = [];

  // ⚠️ ORDER MUST MATCH TEMPLATE BODY VISUAL ORDER
  switch (activity.type) {
    case "SPRAY":
      parameters = [
        { type: "text", text: sanitize(user.firstName || "Farmer") },
        { type: "text", text: sanitize(farm.fieldName || "Your Farm") },
        { type: "text", text: advisoryDate },
        { type: "text", text: sanitize(activity.details?.chemical || "-") },
        { type: "text", text: sanitize(activity.details?.quantity || "-") },
        { type: "text", text: sanitize(activity.details?.method || "-") },
        { type: "text", text: sanitize(activity.details?.time || "-") },
      ];
      break;
    case "FERTIGATION":
      parameters = [
        { type: "text", text: sanitize(user.firstName || "Farmer") },
        { type: "text", text: sanitize(farm.fieldName || "Your Farm") },
        { type: "text", text: advisoryDate },
        {
          type: "text",
          text: sanitize(
            activity.details?.chemical || activity.details?.fertilizer || "-",
          ),
        },
        { type: "text", text: sanitize(activity.details?.quantity || "-") },
        { type: "text", text: sanitize(activity.details?.method || "-") },
        { type: "text", text: sanitize(activity.details?.time || "-") },
      ];
      break;

    case "IRRIGATION":
      parameters = [
        { type: "text", text: sanitize(user.firstName || "Farmer") },
        { type: "text", text: sanitize(farm.fieldName || "Your Farm") },
        { type: "text", text: advisoryDate },
        { type: "text", text: sanitize(activity.details?.quantity || "-") },
        { type: "text", text: sanitize(activity.details?.method || "-") },
        { type: "text", text: sanitize(activity.details?.time || "-") },
      ];
      break;

    case "WEATHER":
      parameters = [
        { type: "text", text: sanitize(user.firstName || "Farmer") },
        { type: "text", text: sanitize(farm.fieldName || "Your Farm") },
        { type: "text", text: advisoryDate },
        { type: "text", text: sanitize(activity.message || "-") },
        {
          type: "text",
          text: sanitize(activity.details?.temperature || "-"),
        },
        {
          type: "text",
          text: sanitize(activity.details?.rainProbability || "-"),
        },
      ];
      break;

    case "CROP_RISK":
      parameters = [
        { type: "text", text: sanitize(user.firstName || "Farmer") },
        { type: "text", text: sanitize(farm.fieldName || "Your Farm") },
        { type: "text", text: advisoryDate },
        {
          type: "text",
          text: sanitize(activity.details?.riskLevel || "-"),
        },
        {
          type: "text",
          text: sanitize(activity.details?.reason || "-"),
        },
        { type: "text", text: sanitize(activity.message || "-") },
      ];
      break;

    default:
      throw new Error(`Unsupported activity type: ${activity.type}`);
  }

  console.log(
    `📤 Sending template: ${templateName}, Lang: ${whatsappLang}, Params: ${parameters.length}`,
  );

  const payload = {
    messaging_product: "whatsapp",
    to: user.phone.replace("+", ""),
    type: "template",
    template: {
      name: templateName,
      language: { code: whatsappLang },
      components: [
        {
          type: "body",
          parameters,
        },
      ],
    },
  };

  const response = await axios.post(GRAPH_URL, payload, {
    headers: {
      Authorization: `Bearer ${WHATSAPP_TOKEN}`,
      "Content-Type": "application/json",
    },
    timeout: 10000,
  });

  return response.data;
};
