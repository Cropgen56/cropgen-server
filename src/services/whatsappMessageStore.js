import WhatsAppMessage from "../models/whatsappmessage.model.js";
import { normalizePhoneDigits } from "../utils/whatsapputility/phoneMatch.js";

/**
 * Build display text for farm_advisory template notifications (admin chat history).
 */
export function formatTemplateAsChatText(templateName, parameters = []) {
  if (templateName === "farm_advisory" && Array.isArray(parameters)) {
    const [
      farmerName = "Farmer",
      advisoryDate = "",
      cropName = "",
      fieldName = "",
      area = "",
      spray = "",
      fertigation = "",
      irrigation = "",
      weather = "",
      cropRisk = "",
      monitoring = "",
      carbon = "",
    ] = parameters;

    const lines = [
      `🌾 *Farm Advisory - Today*`,
      ``,
      `${farmerName}`,
      `📅 ${advisoryDate}`,
      `📍 ${cropName} — ${fieldName} (${area})`,
      ``,
      spray ? `🧴 *Spray*\n${spray}` : null,
      fertigation ? `🌿 *Fertigation*\n${fertigation}` : null,
      irrigation ? `🚿 *Irrigation*\n${irrigation}` : null,
      weather ? `🌦️ *Weather*\n${weather}` : null,
      cropRisk ? `⚠️ *Crop risk*\n${cropRisk}` : null,
      monitoring ? `👁️ *Monitoring*\n${monitoring}` : null,
      carbon ? `🌍 *Carbon*\n${carbon}` : null,
    ].filter(Boolean);

    return lines.join("\n\n");
  }

  return `📩 *${templateName || "notification"}*\n${JSON.stringify(parameters)}`;
}

export async function saveWhatsAppOutbound({
  farmerId,
  phone,
  text,
  advisoryId = null,
  waMessageId = null,
  source = "admin_reply",
  rawPayload = null,
  messageType = "text",
}) {
  const normalizedPhone = normalizePhoneDigits(phone);
  if (!farmerId || !normalizedPhone || !text) return null;

  return WhatsAppMessage.create({
    farmerId,
    phone: normalizedPhone,
    direction: "OUT",
    messageType,
    text,
    advisoryId,
    waMessageId,
    source,
    deliveryStatus: waMessageId ? "sent" : "pending",
    rawPayload,
    timestamp: new Date(),
  });
}

export async function saveWhatsAppInbound({
  farmerId,
  phone,
  text,
  advisoryId = null,
  waMessageId = null,
  rawPayload = null,
  messageType = "text",
}) {
  const normalizedPhone = normalizePhoneDigits(phone);
  if (!farmerId || !normalizedPhone) return null;

  return WhatsAppMessage.create({
    farmerId,
    phone: normalizedPhone,
    direction: "IN",
    messageType,
    text: text || "",
    advisoryId,
    waMessageId,
    source: "farmer",
    deliveryStatus: "received",
    rawPayload,
    timestamp: new Date(),
  });
}

export async function updateMessageDeliveryByWaId(waMessageId, status) {
  if (!waMessageId) return;
  const mapped =
    status === "read"
      ? "read"
      : status === "delivered"
        ? "delivered"
        : status === "sent"
          ? "sent"
          : status === "failed"
            ? "failed"
            : status;

  await WhatsAppMessage.findOneAndUpdate(
    { waMessageId },
    { $set: { deliveryStatus: mapped } },
  );
}
