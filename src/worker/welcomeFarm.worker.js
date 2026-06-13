import cron from "node-cron";

import User from "../models/user.model.js";
import FarmField from "../models/field.model.js";
import Notification from "../models/notification.model.js";
import { createWelcomeFarmNotification } from "../services/notification.service.js";
import { isBiodropsUser } from "../utils/organization/biodropsOrganization.js";

export const startWelcomeFarmReminderWorker = () => {
  cron.schedule("0 12 * * *", async () => {
    try {
      const users = await User.find({})
        .populate("organization", "organizationCode")
        .lean();

      for (const user of users) {
        if (isBiodropsUser(user)) continue;

        const farmCount = await FarmField.countDocuments({ user: user._id });

        if (farmCount === 0) {
          const alreadySent = await Notification.exists({
            userId: user._id,
            templateName: "cropgen_create_farm_reminder",
          });

          if (!alreadySent) {
            await createWelcomeFarmNotification(user._id);
          }
        }
      }
    } catch (error) {
      console.error("Welcome farm reminder job failed:", error.message);
    }
  });
};
