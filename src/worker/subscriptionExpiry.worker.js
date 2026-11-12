import cron from "node-cron";
import UserSubscription from "../models/user-subscription.model.js";
import Notification from "../models/notification.model.js";
import { createSubscriptionExpiryNotification } from "../services/notification.service.js";
import { isBiodropsUser } from "../utils/organization/biodropsOrganization.js";

/**
 * Marks every active subscription whose end date has passed as expired and
 * sends the 7 / 3 / 1-day expiry reminders. Runs nightly (see below).
 * Returns the number of subscriptions it expired.
 */
export const runSubscriptionExpiry = async (now = new Date()) => {
  const expired = await UserSubscription.updateMany(
    {
      status: "active",
      endDate: { $lte: now },
    },
    { $set: { status: "expired" } },
  );
  return expired.modifiedCount ?? 0;
};

export const startSubscriptionExpiryJob = () => {
  cron.schedule("0 0 * * *", async () => {
    try {
      const now = new Date();

      await runSubscriptionExpiry(now);

      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 7);

      const activeSubs = await UserSubscription.find({
        status: "active",
        endDate: { $lte: futureDate },
      }).populate({
        path: "userId",
        populate: { path: "organization", select: "organizationCode" },
      });

      for (const sub of activeSubs) {
        if (isBiodropsUser(sub.userId)) continue;

        const diffTime = sub.endDate - now;
        const daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (![7, 3, 1].includes(daysRemaining)) continue;

        const alreadySent = await Notification.exists({
          userId: sub.userId,
          referenceId: sub._id,
          templateName: "subscription_expiry_reminder",
        });

        if (alreadySent) continue;

        await createSubscriptionExpiryNotification(sub, daysRemaining);
      }
    } catch (error) {
      console.error("Subscription expiry job failed:", error);
    }
  });
};
