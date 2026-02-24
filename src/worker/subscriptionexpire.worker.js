import cron from "node-cron";
import UserSubscription from "../models/usersubscription.model.js";

export const startSubscriptionExpiryJob = () => {
  cron.schedule("0 0 * * *", async () => {
    console.log("Cron triggered at:", new Date());

    try {
      const now = new Date();

      const expiredSubscriptions = await UserSubscription.updateMany(
        {
          status: "active",
          endDate: { $lte: now },
        },
        {
          $set: { status: "expired" },
        },
      );

      console.log(
        `Expired ${expiredSubscriptions.modifiedCount} subscriptions`,
      );
    } catch (error) {
      console.error("Subscription expiry job failed:", error);
    }
  });
};
