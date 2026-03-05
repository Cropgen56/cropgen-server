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
      // Process up to BATCH_SIZE notifications safely
      for (let i = 0; i < BATCH_SIZE; i++) {
        // 🔐 Atomic locking to prevent duplicate processing
        const notification = await Notification.findOneAndUpdate(
          {
            status: { $in: ["pending", "failed"] },
            retryCount: { $lt: MAX_RETRY },
          },
          {
            $set: { status: "processing" },
          },
          {
            new: true,
          },
        ).populate("userId");

        if (!notification) break;

        await processNotification(notification);
      }
    } catch (err) {
      console.error("Worker fatal error:", err.message);
    }
  });
};

async function processNotification(notification) {
  try {
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
      notification.messageId = response?.data?.messages?.[0]?.id || null;
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

    /* ================= SUCCESS ================= */

    notification.status = "sent";
    notification.error = null;
    await notification.save();

    console.log(
      `✅ Notification sent (${notification.templateName}) via ${notification.channel}`,
    );
  } catch (err) {
    /* ================= RETRY LOGIC ================= */

    notification.retryCount += 1;

    notification.status =
      notification.retryCount < MAX_RETRY ? "pending" : "failed";

    notification.error =
      err.response?.data?.error?.message || err.message || "Unknown error";

    await notification.save();

    console.error(
      `❌ Notification failed (${notification.templateName}) - Retry ${notification.retryCount}`,
    );
  }
}
