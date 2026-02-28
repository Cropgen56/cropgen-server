import cron from "node-cron";
import FarmAdvisory from "../models/farmadvisory.model.js";
import FarmField from "../models/fieldModel.js";
import { sendWhatsAppTemplate } from "../services/whatsapp.service.js";
import { sendEmail } from "../services/email.services.js";
import { advisoryEmailTemplate } from "../templates/advisory.email.tempalte.js";

const MAX_RETRY = 3;

const sanitize = (text = "") =>
  text.toString().replace(/\s+/g, " ").trim().substring(0, 900);

export const startAdvisoryWorker = () => {
  console.log("📩 Advisory Worker Started");

  cron.schedule("*/1 * * * *", async () => {
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
        const farm = await FarmField.findById(advisory.farmFieldId)
          .populate("user")
          .lean();

        if (!farm?.user) throw new Error("User missing");

        const user = farm.user;
        const userName = sanitize(user.firstName || "Farmer");
        const farmName = sanitize(farm.fieldName || "Your Farm");

        // Build advisoryData
        const advisoryData = {
          spray: sanitize(
            advisory.activitiesToDo[0]?.message || "No spray advisory.",
          ),
          fertigation: sanitize(
            advisory.activitiesToDo[1]?.message || "No fertigation advisory.",
          ),
          irrigation: sanitize(
            advisory.activitiesToDo[2]?.message || "No irrigation advisory.",
          ),
          weather: sanitize(
            advisory.activitiesToDo[3]?.message || "No weather update.",
          ),
          cropRisk: sanitize(
            advisory.activitiesToDo[4]?.message || "No crop risk alert.",
          ),
        };

        if (user.phone) {
          await sendWhatsAppTemplate({
            to: user.phone.replace("+", ""),
            templateName: "farm_advisory_notification",
            parameters: [
              userName,
              farmName,
              advisoryData.spray,
              advisoryData.fertigation,
              advisoryData.irrigation,
              advisoryData.weather,
              advisoryData.cropRisk,
            ],
          });

          console.log("📲 WhatsApp advisory sent");
        } else if (user.email) {
          const html = advisoryEmailTemplate({
            userName,
            farmName,
            advisory,
          });

          await sendEmail({
            to: user.email,
            subject: "🌾 CropGen Smart Farm Advisory",
            html,
          });

          console.log("📧 Email advisory sent");
        } else {
          throw new Error("No contact info available");
        }

        advisory.whatsappNotification.isSent = true;
        advisory.whatsappNotification.status = "sent";
        advisory.whatsappNotification.sentAt = new Date();
        advisory.whatsappNotification.error = null;

        await advisory.save();

        console.log("✅ Advisory delivered:", advisory._id);
      } catch (err) {
        advisory.whatsappNotification.retryCount += 1;

        advisory.whatsappNotification.status =
          advisory.whatsappNotification.retryCount < MAX_RETRY
            ? "pending"
            : "failed";

        advisory.whatsappNotification.error =
          err.response?.data?.error?.message || err.message || "Unknown error";

        await advisory.save();

        console.error("❌ Advisory failed:", advisory._id);
      }
    }
  });
};
