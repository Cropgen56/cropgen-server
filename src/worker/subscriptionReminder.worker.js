import cron from "node-cron";
import UserSubscription from "../models/usersubscription.model.js";
import { sendWhatsAppTemplate } from "../services/whatsapp.service.js";
import { sendEmail } from "../services/email.service.js";

export const startSubscriptionReminderWorker = () => {
  cron.schedule("0 9 * * *", async () => {
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + 5);

    const subscriptions = await UserSubscription.find({
      status: "active",
      endDate: { $lte: targetDate },
      "expiryReminder.isSent": false,
    }).populate("userId");

    for (const sub of subscriptions) {
      const user = sub.userId;

      try {
        if (user.phone) {
          await sendWhatsAppTemplate({
            to: user.phone.replace("+", ""),
            templateName: "subscription_expiry_reminder",
            parameters: [user.firstName, sub.endDate.toDateString()],
          });
        } else if (user.email) {
          await sendEmail({
            to: user.email,
            subject: "Subscription Expiring Soon",
            html: `<p>Hello ${user.firstName}, your plan expires on ${sub.endDate}</p>`,
          });
        }

        sub.expiryReminder.isSent = true;
        sub.expiryReminder.status = "sent";
        await sub.save();
      } catch (err) {
        sub.expiryReminder.retryCount += 1;
        sub.expiryReminder.status = "failed";
        await sub.save();
      }
    }
  });
};
