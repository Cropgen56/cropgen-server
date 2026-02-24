import cron from "node-cron";
import axios from "axios";
import FarmAdvisory from "../models/farmadvisory.model.js";
import FarmField from "../models/fieldModel.js";

const WHATSAPP_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;

const sanitizeText = (text = "") => {
  return text
    .replace(/[\n\r\t]/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
};

export const runWhatsAppWorker = () => {
  console.log("📩 WhatsApp worker initialized");

  cron.schedule("*/1 * * * *", async () => {
    console.log("🔄 WhatsApp worker running...");

    try {
      const unsentAdvisories = await FarmAdvisory.find({
        "whatsappNotification.isSent": false,
        "whatsappNotification.retryCount": { $lt: 3 },
      }).limit(10);

      if (!unsentAdvisories.length) {
        console.log("No pending advisories");
        return;
      }

      for (const advisory of unsentAdvisories) {
        try {
          const farm = await FarmField.findById(advisory.farmFieldId).populate(
            "user",
          );

          if (!farm?.user?.phone) {
            console.log("User phone missing. Skipping...");
            continue;
          }

          /* ================= EXTRACT ACTIVITIES BY TYPE ================= */

          const getActivityText = (type) => {
            const activity = advisory.activitiesToDo?.find(
              (a) => a.type === type,
            );

            if (!activity) return "No recommendation";

            return sanitizeText(
              `${activity.title} - ${activity.message}`,
            ).substring(0, 300);
          };

          const sprayText = getActivityText("SPRAY");
          const fertigationText = getActivityText("FERTIGATION");
          const irrigationText = getActivityText("IRRIGATION");
          const weatherText = getActivityText("WEATHER");
          const cropRiskText = getActivityText("CROP_RISK");

          /* ================= SEND WHATSAPP ================= */

          const response = await axios.post(
            `https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/messages`,
            {
              messaging_product: "whatsapp",
              to: farm.user.phone.replace("+", ""),
              type: "template",
              template: {
                name: "farm_advisory_notification",
                language: { code: "en" },
                components: [
                  {
                    type: "body",
                    parameters: [
                      {
                        type: "text",
                        text: sanitizeText(farm.user.firstName || "Farmer"),
                      },
                      {
                        type: "text",
                        text: sanitizeText(farm.fieldName || "Your Field"),
                      },
                      { type: "text", text: sprayText },
                      { type: "text", text: fertigationText },
                      { type: "text", text: irrigationText },
                      { type: "text", text: weatherText },
                      { type: "text", text: cropRiskText },
                    ],
                  },
                ],
              },
            },
            {
              headers: {
                Authorization: `Bearer ${WHATSAPP_TOKEN}`,
                "Content-Type": "application/json",
              },
            },
          );

          /* ================= SUCCESS UPDATE ================= */

          advisory.whatsappNotification.isSent = true;
          advisory.whatsappNotification.status = "sent";
          advisory.whatsappNotification.messageId =
            response.data.messages?.[0]?.id || null;
          advisory.whatsappNotification.error = null;
          advisory.whatsappNotification.lastAttemptAt = new Date();
          advisory.whatsappNotification.sentAt = new Date();

          await advisory.save();

          console.log(`✅ WhatsApp sent for advisory ${advisory._id}`);
        } catch (err) {
          /* ================= FAILURE UPDATE ================= */

          const metaError =
            err.response?.data?.error?.message ||
            err.response?.data?.error?.error_data?.details ||
            err.message ||
            "Unknown error";

          advisory.whatsappNotification.retryCount += 1;
          advisory.whatsappNotification.status = "failed";
          advisory.whatsappNotification.error = metaError;
          advisory.whatsappNotification.lastAttemptAt = new Date();

          await advisory.save();

          console.error(
            `❌ WhatsApp failed for advisory ${advisory._id}:`,
            metaError,
          );
        }
      }
    } catch (error) {
      console.error("🚨 WhatsApp Worker Fatal Error:", error.message);
    }
  });
};
