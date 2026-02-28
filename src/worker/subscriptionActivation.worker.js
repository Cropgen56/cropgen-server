import cron from "node-cron";
import UserSubscription from "../models/usersubscription.model.js";
import { sendWhatsAppTemplate } from "../services/whatsapp.service.js";
import { sendEmail } from "../services/email.services.js";
import { buildSubscriptionActivationEmailTemplate } from "../templates/subscriptionActivationEmail.template.js";

const MAX_RETRY = 3;

const sanitize = (text = "") => text.toString().replace(/\s+/g, " ").trim();

export const startSubscriptionActivationWorker = () => {
  console.log("🚀 Subscription Activation Worker Started");

  cron.schedule("*/1 * * * *", async () => {
    while (true) {
      const subscription = await UserSubscription.findOneAndUpdate(
        {
          status: "active",
          "activationNotification.isSent": false,
          "activationNotification.retryCount": { $lt: MAX_RETRY },
        },
        {
          $set: {
            "activationNotification.status": "processing",
          },
        },
        { new: true },
      )
        .populate("userId")
        .populate("fieldId")
        .populate("planId");

      if (!subscription) break;

      try {
        const user = subscription.userId;
        const field = subscription.fieldId;
        const plan = subscription.planId;

        if (!user) throw new Error("User not found");

        const userName = sanitize(user.firstName || "Farmer");
        const planName = sanitize(plan?.name || "Plan");
        const platform = sanitize(subscription.platform);
        const billingCycle = sanitize(subscription.billingCycle);
        const fieldName = sanitize(field?.fieldName || "Field");
        const area = sanitize(subscription.area?.toString() || "0");
        const startDate = subscription.startDate?.toDateString();
        const endDate = subscription.endDate?.toDateString();

        // ===== WHATSAPP =====
        if (user.phone) {
          await sendWhatsAppTemplate({
            to: user.phone.replace("+", ""),
            templateName: "plan_activation_notification",
            parameters: [
              userName,
              planName,
              platform,
              billingCycle,
              fieldName,
              area,
              startDate,
              endDate,
            ],
          });

          console.log("📲 WhatsApp activation sent");
        }

        // ===== EMAIL FALLBACK =====
        else if (user.email) {
          const html = buildSubscriptionActivationEmailTemplate({
            userName,
            planName,
            platform,
            billingCycle,
            fieldName,
            area,
            startDate,
            endDate,
          });

          await sendEmail({
            to: user.email,
            subject: "🎉 Subscription Activated Successfully",
            html,
          });

          console.log("📧 Email activation sent");
        } else {
          throw new Error("No contact info available");
        }

        subscription.activationNotification.isSent = true;
        subscription.activationNotification.status = "sent";
        subscription.activationNotification.error = null;

        await subscription.save();

        console.log("✅ Activation notification sent:", subscription._id);
      } catch (err) {
        subscription.activationNotification.retryCount += 1;

        subscription.activationNotification.status =
          subscription.activationNotification.retryCount < MAX_RETRY
            ? "pending"
            : "failed";

        subscription.activationNotification.error =
          err.response?.data?.error?.message || err.message || "Unknown error";

        await subscription.save();

        console.error("❌ Activation failed:", err.message);
      }
    }
  });
};
