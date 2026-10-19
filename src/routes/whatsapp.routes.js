import express from "express";
import {
  sendFarmAdvisoryMessage,
  getAllWhatsAppMessages,
  getWhatsAppChatsSummary,
  getWhatsAppMessageById,
  deleteWhatsAppMessage,
  updateWhatsAppMessage,
  replyToWhatsAppMessage,
  markWhatsAppChatRead,
  getWhatsAppAgentSettings,
  patchWhatsAppAgentSettings,
} from "../controllers/whatsapp/index.js";
import {
  verifyWebhook,
  receiveWebhook,
} from "../controllers/whatsapp/whatsapp.webhook.controller.js";
import { isAuthenticated } from "../middleware/auth.middleware.js";

const router = express.Router();

/** Meta webhook — public (verify token + optional signature in controller) */
router.get("/webhook", verifyWebhook);
router.post("/webhook", receiveWebhook);

/** Admin panel — authenticated */
router.use(isAuthenticated);

router.get("/agent-settings", getWhatsAppAgentSettings);
router.patch("/agent-settings", patchWhatsAppAgentSettings);

router.get("/chats/summary", getWhatsAppChatsSummary);
router.get("/chats", getAllWhatsAppMessages);
router.post("/chats/:phone/read", markWhatsAppChatRead);
router.get("/chat/:id", getWhatsAppMessageById);
router.patch("/chat/:id", updateWhatsAppMessage);
router.delete("/chat/:id", deleteWhatsAppMessage);
router.post("/chat/reply", replyToWhatsAppMessage);
router.post("/send-farm-advisory", sendFarmAdvisoryMessage);

export default router;
