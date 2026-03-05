import cron from "node-cron";
import { connectToDatabase } from "../config/db.js";

import User from "../models/usersModel.js";
import FarmField from "../models/fieldModel.js";
import Notification from "../models/notification.model.js";
import { createWelcomeFarmNotification } from "../services/notification.service.js";

export const startWelcomeFarmReminderWorker = async () => {
  await connectToDatabase();

  console.log("🌾 Welcome Farm Reminder Worker Started");

  // Run every day at 12:00 PM
  cron.schedule("0 12 * * *", async () => {
    try {
      console.log("⏰ Running welcome farm reminder job...");

      const users = await User.find({}).lean();

      console.log(`👤 Found ${users.length} users`);

      for (const user of users) {
        // Check if user has any farm
        const farmCount = await FarmField.countDocuments({ user: user._id });

        if (farmCount === 0) {
          // Prevent duplicate reminders
          const alreadySent = await Notification.exists({
            userId: user._id,
            templateName: "cropgen_create_farm_reminder",
          });

          if (!alreadySent) {
            await createWelcomeFarmNotification(user._id);

            console.log(`📩 Reminder created for user ${user._id}`);
          }
        }
      }

      console.log("✅ Welcome farm reminder job completed");
    } catch (error) {
      console.error("❌ Welcome farm reminder job failed:", error.message);
    }
  });
};
