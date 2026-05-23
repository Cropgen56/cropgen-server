import FarmAdvisory from "../../features/advisory/models/farmAdvisory.model.js";
import WhatsAppMessage from "../../models/whatsappmessage.model.js";
import { sendWhatsAppReply } from "../../services/whatsappService.js";
import {
  findUserByWhatsAppPhone,
  normalizePhoneDigits,
} from "../../utils/whatsapputility/phoneMatch.js";

export const verifyWebhook = (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  const verifyToken =
    process.env.WHATSAPP_VERIFY_TOKEN || process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;

  if (mode === "subscribe" && verifyToken && token === verifyToken) {
    console.log("✅ Webhook verified successfully");
    return res.status(200).send(challenge);
  }

  console.warn("⚠️ Webhook verification failed — check WHATSAPP_VERIFY_TOKEN");
  return res.sendStatus(403);
};

export const receiveWebhook = async (req, res) => {
  try {
    const message = req.body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];

    if (!message) return res.sendStatus(200);

    const phone = normalizePhoneDigits(message.from);
    const text = message.text?.body || "";
    const timestamp = new Date(Number(message.timestamp) * 1000);

    const farmer = await findUserByWhatsAppPhone(phone);
    if (!farmer) {
      console.warn(
        `[WhatsApp webhook] No user for phone +${phone} — inbound not stored`,
      );
      return res.sendStatus(200);
    }

    const lastOutbound = await WhatsAppMessage.findOne({
      farmerId: farmer._id,
      direction: "OUT",
    })
      .sort({ createdAt: -1 })
      .select("advisoryId")
      .lean();

    const advisoryId = lastOutbound?.advisoryId ?? null;

    await WhatsAppMessage.create({
      advisoryId,
      farmerId: farmer._id,
      phone,
      direction: "IN",
      messageType: message.type || "text",
      text,
      timestamp,
      rawPayload: message,
    });

    if (advisoryId) {
      await FarmAdvisory.findByIdAndUpdate(advisoryId, {
        $set: { updatedAt: new Date() },
      });
    }

    const autoReply =
      "🙏 We received your message. Our agronomist will get back to you shortly.";

    try {
      await sendWhatsAppReply(phone, autoReply);

      await WhatsAppMessage.create({
        advisoryId,
        farmerId: farmer._id,
        phone,
        direction: "OUT",
        messageType: "text",
        text: autoReply,
      });
    } catch (replyError) {
      console.error(
        "[WhatsApp webhook] Auto-reply failed (IN message was saved):",
        replyError.response?.data?.error || replyError.message,
      );
    }

    return res.sendStatus(200);
  } catch (error) {
    console.error("❌ WhatsApp webhook error:", error);
    return res.sendStatus(500);
  }
};
