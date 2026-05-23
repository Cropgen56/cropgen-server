import crypto from "crypto";
import FarmAdvisory from "../../features/advisory/models/farmAdvisory.model.js";
import WhatsAppMessage from "../../models/whatsappmessage.model.js";
import {
  findUserByWhatsAppPhone,
  normalizePhoneDigits,
} from "../../utils/whatsapputility/phoneMatch.js";
import { sendWhatsAppReply } from "../../services/whatsappService.js";
import {
  saveWhatsAppInbound,
  saveWhatsAppOutbound,
  updateMessageDeliveryByWaId,
} from "../../services/whatsappMessageStore.js";
import {
  generateWhatsAppAgentReply,
  logWhatsAppAgentStatus,
} from "../../services/whatsappAgent.service.js";

let agentStatusLogged = false;
function verifyMetaSignature(req) {
  const secret = process.env.META_APP_SECRET || process.env.WHATSAPP_APP_SECRET;
  if (!secret) return true;

  const signature = req.headers["x-hub-signature-256"];
  if (!signature) return false;

  const rawBody = req.rawBody || JSON.stringify(req.body);
  const expected =
    "sha256=" +
    crypto.createHmac("sha256", secret).update(rawBody).digest("hex");

  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expected),
    );
  } catch {
    return false;
  }
}

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

function extractInboundText(message) {
  if (message.type === "text") return message.text?.body || "";
  if (message.type === "button") return message.button?.text || "";
  if (message.type === "interactive") {
    return (
      message.interactive?.button_reply?.title ||
      message.interactive?.list_reply?.title ||
      ""
    );
  }
  return `[${message.type || "message"}]`;
}

export const receiveWebhook = async (req, res) => {
  try {
    if (!agentStatusLogged) {
      logWhatsAppAgentStatus().catch(() => {});
      agentStatusLogged = true;
    }

    if (!verifyMetaSignature(req)) {
      console.warn("[WhatsApp webhook] Invalid signature");
      return res.sendStatus(403);
    }

    const value = req.body?.entry?.[0]?.changes?.[0]?.value;

    if (value?.statuses?.length) {
      for (const st of value.statuses) {
        await updateMessageDeliveryByWaId(st.id, st.status);
      }
      return res.sendStatus(200);
    }

    const message = value?.messages?.[0];
    if (!message) return res.sendStatus(200);

    const phone = normalizePhoneDigits(message.from);
    const text = extractInboundText(message);
    const timestamp = new Date(Number(message.timestamp) * 1000);
    const waMessageId = message.id;

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

    await saveWhatsAppInbound({
      farmerId: farmer._id,
      phone,
      text,
      advisoryId,
      waMessageId,
      rawPayload: message,
      messageType: message.type === "text" ? "text" : "unknown",
    });

    if (advisoryId) {
      await FarmAdvisory.findByIdAndUpdate(advisoryId, {
        $set: { updatedAt: new Date() },
      });
    }

    let replyPayload = null;
    try {
      replyPayload = await generateWhatsAppAgentReply({
        farmer,
        phone,
        userText: text,
        waMessageId,
      });
    } catch (agentErr) {
      console.error(
        "[WhatsApp webhook] Agent reply generation failed:",
        agentErr?.message || agentErr,
      );
      replyPayload = null;
    }

    if (!replyPayload?.text) {
      return res.sendStatus(200);
    }

    const { text: replyText, source } = replyPayload;

    try {
      const replyResult = await sendWhatsAppReply(phone, replyText);
      const replyWaId = replyResult?.messages?.[0]?.id;

      await saveWhatsAppOutbound({
        farmerId: farmer._id,
        phone,
        text: replyText,
        advisoryId,
        waMessageId: replyWaId,
        source,
        rawPayload: replyResult,
      });
    } catch (replyError) {
      console.error(
        "[WhatsApp webhook] Outbound reply failed (IN message was saved):",
        replyError.response?.data?.error || replyError.message,
      );
    }

    return res.sendStatus(200);
  } catch (error) {
    console.error("❌ WhatsApp webhook error:", error);
    return res.sendStatus(500);
  }
};
