import cron from "node-cron";
import UserSubscription from "../models/usersubscription.model.js";
import Notification from "../models/notification.model.js";
import { createSubscriptionExpiryNotification } from "../services/notification.service.js";

export const startSubscriptionExpiryJob = () => {
  // Run daily at 12:00 AM
  cron.schedule("0 0 * * *", async () => {
    try {
      console.log("⏰ Running subscription expiry job...");

      const now = new Date();

      /* 1️⃣ Expire subscriptions */
      const expired = await UserSubscription.updateMany(
        {
          status: "active",
          endDate: { $lte: now },
        },
        { $set: { status: "expired" } },
      );

      console.log(`Expired ${expired.modifiedCount} subscriptions`);

      /* 2️⃣ Get subscriptions expiring in 7,3,1 days */
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 7);

      const activeSubs = await UserSubscription.find({
        status: "active",
        endDate: { $lte: futureDate },
      }).populate("userId");

      for (const sub of activeSubs) {
        const diffTime = sub.endDate - now;
        const daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (![7, 3, 1].includes(daysRemaining)) continue;

        // Prevent duplicate reminder
        const alreadySent = await Notification.exists({
          userId: sub.userId,
          referenceId: sub._id,
          templateName: "subscription_expiry_reminder",
        });

        if (alreadySent) continue;

        await createSubscriptionExpiryNotification(sub, daysRemaining);

        console.log(
          `📩 Expiry reminder created for user ${sub.userId} (${daysRemaining} days)`,
        );
      }

      console.log("✅ Subscription expiry job completed");
    } catch (error) {
      console.error("❌ Subscription expiry job failed:", error);
    }
  });
};
