import cron from "node-cron";
import Notification from "../models/notification.model.js";
import { sendWhatsAppTemplate } from "../services/whatsapp.service.js";
import { generateEmailFromTemplate } from "../services/email.services.js";
import { sendEmail } from "../services/email.services.js";
import {
  formatTemplateAsChatText,
  saveWhatsAppOutbound,
} from "../services/whatsappMessageStore.js";

const MAX_RETRY = 3;
const BATCH_SIZE = 10;
/** A send takes seconds; "processing" for longer means the worker was interrupted. */
const STUCK_AFTER_MS = 15 * 60 * 1000;
/** Older notifications are no longer worth sending (e.g. a months-old welcome). */
const STALE_AFTER_MS = 24 * 60 * 60 * 1000;

/**
 * Rows are set to "processing" before sending. If the process dies mid-send
 * (restart, crash) they stay "processing" forever and are never retried.
 * Put recent ones back in the queue (counting a retry) and mark old ones
 * "skipped" so a stale message is never sent.
 */
export async function recoverStuckNotifications(now = new Date()) {
  const stuckBefore = new Date(now.getTime() - STUCK_AFTER_MS);
  const staleBefore = new Date(now.getTime() - STALE_AFTER_MS);
  const stuck = { status: "processing", updatedAt: { $lt: stuckBefore } };

  const skipped = await Notification.updateMany(
    { ...stuck, createdAt: { $lt: staleBefore } },
    {
      $set: {
        status: "skipped",
        error: "Stuck in processing (worker interrupted); too old to send",
      },
    },
  );
  const exhausted = await Notification.updateMany(
    { ...stuck, createdAt: { $gte: staleBefore }, retryCount: { $gte: MAX_RETRY - 1 } },
    {
      $set: { status: "failed", error: "Worker interrupted while sending" },
      $inc: { retryCount: 1 },
    },
  );
  const requeued = await Notification.updateMany(
    { ...stuck, createdAt: { $gte: staleBefore }, retryCount: { $lt: MAX_RETRY - 1 } },
    {
      $set: { status: "pending", error: "Worker interrupted while sending; retrying" },
      $inc: { retryCount: 1 },
    },
  );

  const counts = {
    skipped: skipped.modifiedCount,
    failed: exhausted.modifiedCount,
    requeued: requeued.modifiedCount,
  };
  if (counts.skipped || counts.failed || counts.requeued) {
    console.warn("[Notification] recovered stuck notifications", counts);
  }
  return counts;
}

export const startNotificationWorker = () => {
  cron.schedule("*/1 * * * *", async () => {
    try {
      await recoverStuckNotifications();

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
        ).populate({
          path: "userId",
          populate: { path: "organization", select: "organizationCode" },
        });

        if (!notification) break;

        await processNotification(notification);
      }
    } catch (err) {
      console.error("Worker fatal error:", err.message);
    }
  });
};

export async function processNotification(notification) {
  try {
    const user = notification.userId;

    if (!user) throw new Error("User not found");

    /* ================= WHATSAPP PRIORITY ================= */

    if (user.phone) {
      const response = await sendWhatsAppTemplate({
        to: user.phone.replace("+", ""),
        templateName: notification.templateName,
        parameters: notification.parameters,
        organizationCode: user.organization?.organizationCode,
      });

      notification.channel = "whatsapp";
      const waMessageId = response?.data?.messages?.[0]?.id || null;
      notification.messageId = waMessageId;

      const chatText = formatTemplateAsChatText(
        notification.templateName,
        notification.parameters,
      );
      const phoneDigits = user.phone.replace(/\D/g, "");
      await saveWhatsAppOutbound({
        farmerId: user._id,
        phone: phoneDigits,
        text: chatText,
        advisoryId: notification.referenceId || null,
        waMessageId,
        source: "advisory_template",
        rawPayload: response?.data,
        messageType: "template",
      });
    } else if (user.email) {
      /* ================= EMAIL FALLBACK ================= */
      const organizationCode = user.organization?.organizationCode;
      const { subject, html } = generateEmailFromTemplate(
        notification.templateName,
        notification.parameters,
        notification.createdAt,
        organizationCode,
      );

      await sendEmail({
        to: user.email,
        subject,
        html,
        organizationCode,
      });

      notification.channel = "email";
    } else {
      throw new Error("No contact method available");
    }

    /* ================= SUCCESS ================= */

    notification.status = "sent";
    notification.error = null;
    await notification.save();
  } catch (err) {
    /* ================= RETRY LOGIC ================= */

    notification.retryCount += 1;

    notification.status =
      notification.retryCount < MAX_RETRY ? "pending" : "failed";

    notification.error =
      err.response?.data?.error?.message || err.message || "Unknown error";

    await notification.save();

    const providerError =
      err?.response?.data?.error?.message ||
      err?.response?.data?.message ||
      err?.message ||
      "Unknown error";
    console.error(
      `❌ Notification failed (${notification.templateName}) - Retry ${notification.retryCount}: ${providerError}`,
    );
  }
}
