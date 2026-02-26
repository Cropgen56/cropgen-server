import cron from "node-cron";
import FarmAdvisory from "../models/farmadvisory.model.js";
import FarmField from "../models/fieldModel.js";
import { sendAdvisoryTemplate } from "../services/whatsapp.service.js";

const MAX_RETRY = 3;

export const runWhatsAppWorker = () => {
  console.log("📩 WhatsApp Worker Started");

  cron.schedule("*/1 * * * *", async () => {
    try {
      while (true) {
        const advisory = await FarmAdvisory.findOneAndUpdate(
          {
            "whatsappNotification.isSent": false,
            "whatsappNotification.status": "pending",
            "whatsappNotification.retryCount": { $lt: MAX_RETRY },
          },
          {
            $set: {
              "whatsappNotification.status": "processing",
              "whatsappNotification.lastAttemptAt": new Date(),
            },
          },
          { new: true },
        );

        if (!advisory) break;

        try {
          const farm = await FarmField.findById(advisory.farmFieldId).populate(
            "user",
          );

          if (!farm?.user?.phone) {
            throw new Error("User phone missing");
          }

          let atLeastOneSent = false;

          for (const activity of advisory.activitiesToDo) {
            try {
              await sendAdvisoryTemplate({
                user: farm.user,
                farm,
                activity,
                advisory,
              });
              atLeastOneSent = true;
            } catch (err) {
              const errorMessage =
                err.response?.data?.error?.message || err.message;

              // Skip template not approved
              if (errorMessage?.includes("132001")) {
                console.warn(
                  `⚠️ Template not approved yet for ${activity.type}. Skipping...`,
                );
                continue;
              }

              throw err;
            }
          }

          if (atLeastOneSent) {
            advisory.whatsappNotification.isSent = true;
            advisory.whatsappNotification.status = "sent";
            advisory.whatsappNotification.sentAt = new Date();
            advisory.whatsappNotification.error = null;
          } else {
            advisory.whatsappNotification.status = "failed";
            advisory.whatsappNotification.error = "No template approved yet";
          }

          await advisory.save();

          console.log(`✅ Advisory processed: ${advisory._id}`);
        } catch (err) {
          advisory.whatsappNotification.retryCount += 1;

          advisory.whatsappNotification.status =
            advisory.whatsappNotification.retryCount < MAX_RETRY
              ? "pending"
              : "failed";

          advisory.whatsappNotification.error =
            err.response?.data?.error?.message ||
            err.message ||
            "Unknown error";

          await advisory.save();

          console.error(
            `❌ Advisory failed: ${advisory._id}`,
            advisory.whatsappNotification.error,
          );
        }
      }
    } catch (fatalError) {
      console.error("🚨 Worker Fatal Error:", fatalError.message);
    }
  });
};
