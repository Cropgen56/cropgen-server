import User from "../../models/user.model.js";
import FarmAdvisory from "../../models/farmadvisory.model.js";
import WhatsAppMessage from "../../models/whatsappmessage.model.js";
import { sendWhatsAppReply } from "../../services/whatsappService.js";

export const verifyWebhook = (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    console.log("✅ Webhook verified successfully");
    return res.status(200).send(challenge);
  }

  return res.sendStatus(403);
};

export const receiveWebhook = async (req, res) => {
  try {
    const message = req.body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];

    if (!message) return res.sendStatus(200);

    const phone = message.from;
    const text = message.text?.body || "";
    const timestamp = new Date(Number(message.timestamp) * 1000);

    const farmer = await User.findOne({ phone: `+${phone}` });
    if (!farmer) return res.sendStatus(200);

    const lastSentMessage = await WhatsAppMessage.findOne({
      farmerId: farmer._id,
      direction: "OUT",
    }).sort({ createdAt: -1 });

    if (!lastSentMessage) return res.sendStatus(200);

    const advisoryId = lastSentMessage.advisoryId;

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

    await FarmAdvisory.findByIdAndUpdate(advisoryId, {
      $set: { updatedAt: new Date() },
    });

    const autoReply =
      "🙏 We received your message. Our agronomist will get back to you shortly.";

    await sendWhatsAppReply(phone, autoReply);

    await WhatsAppMessage.create({
      advisoryId,
      farmerId: farmer._id,
      phone,
      direction: "OUT",
      messageType: "text",
      text: autoReply,
    });

    return res.sendStatus(200);
  } catch (error) {
    console.error("❌ WhatsApp webhook error:", error);
    return res.sendStatus(500);
  }
};
