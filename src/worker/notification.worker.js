import cron from "node-cron";
import Notification from "../models/notification.model.js";
import { sendWhatsAppTemplate } from "../services/whatsapp.service.js";
import { generateEmailFromTemplate } from "../services/email.services.js";
import { sendEmail } from "../services/email.services.js";

const MAX_RETRY = 3;
const BATCH_SIZE = 10;

export const startNotificationWorker = () => {
  console.log("🚀 Unified Notification Worker Started");

  cron.schedule("*/1 * * * *", async () => {
    try {
      const notifications = await Notification.find({
        status: { $in: ["pending", "failed"] },
        retryCount: { $lt: MAX_RETRY },
      })
        .limit(BATCH_SIZE)
        .populate("userId");

      for (const notification of notifications) {
        await processNotification(notification);
      }
    } catch (err) {
      console.error("Worker fatal error:", err.message);
    }
  });
};

async function processNotification(notification) {
  try {
    notification.status = "processing";
    await notification.save();

    const user = notification.userId;

    if (!user) throw new Error("User not found");

    /* ================= WHATSAPP PRIORITY ================= */

    if (user.phone) {
      const response = await sendWhatsAppTemplate({
        to: user.phone.replace("+", ""),
        templateName: notification.templateName,
        parameters: notification.parameters,
      });

      notification.channel = "whatsapp";
      notification.messageId = response.data?.messages?.[0]?.id;
    } else if (user.email) {
      /* ================= EMAIL FALLBACK ================= */
      const { subject, html } = generateEmailFromTemplate(
        notification.templateName,
        notification.parameters,
        notification.createdAt,
      );

      await sendEmail({
        to: user.email,
        subject,
        html,
      });

      notification.channel = "email";
    } else {
      throw new Error("No contact method available");
    }

    notification.status = "sent";
    notification.error = null;
    await notification.save();
  } catch (err) {
    notification.retryCount += 1;
    notification.status =
      notification.retryCount < MAX_RETRY ? "pending" : "failed";

    notification.error =
      err.response?.data?.error?.message || err.message || "Unknown error";

    await notification.save();
  }
}
