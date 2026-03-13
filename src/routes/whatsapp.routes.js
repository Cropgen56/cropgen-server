import express from "express";
import {
  sendFarmAdvisoryMessage,
  getAllWhatsAppMessages,
  getWhatsAppMessageById,
  deleteWhatsAppMessage,
  updateWhatsAppMessage,
  replyToWhatsAppMessage,
} from "../controllers/whatsappcontroller/index.js";
import {
  verifyWebhook,
  receiveWebhook,
} from "../controllers/whatsappcontroller/whatsapp.webhook.controller.js";

const router = express.Router();

router.post("/send-farm-advisory", sendFarmAdvisoryMessage);

router.get("/chats/", getAllWhatsAppMessages);
router.get("/chat/:id", getWhatsAppMessageById);
router.delete("/chat/:id", deleteWhatsAppMessage);
router.patch("/chat/:id", updateWhatsAppMessage);
router.post("/chat/reply", replyToWhatsAppMessage);

router.get("/webhook", verifyWebhook);
router.post("/webhook", receiveWebhook);

export default router;
