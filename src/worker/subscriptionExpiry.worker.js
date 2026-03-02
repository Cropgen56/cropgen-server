import cron from "node-cron";
import UserSubscription from "../models/usersubscription.model.js";
import { createSubscriptionExpiryNotification } from "../services/notification.service.js";

export const startSubscriptionExpiryJob = () => {
  cron.schedule("0 0 * * *", async () => {
    try {
      const now = new Date();

      /* 1️⃣ Expire subscriptions */
      await UserSubscription.updateMany(
        {
          status: "active",
          endDate: { $lte: now },
        },
        { $set: { status: "expired" } },
      );

      /* 2️⃣ Reminder logic */
      const activeSubs = await UserSubscription.find({
        status: "active",
      });

      for (const sub of activeSubs) {
        const diffTime = sub.endDate - now;
        const daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if ([7, 3, 1].includes(daysRemaining)) {
          await createSubscriptionExpiryNotification(sub, daysRemaining);
        }
      }
    } catch (error) {
      console.error("Subscription expiry job failed:", error);
    }
  });
};
