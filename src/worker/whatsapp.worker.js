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
      // Keep processing until no pending advisory found
      while (true) {
        const advisory = await FarmAdvisory.findOneAndUpdate(
          {
            "whatsappNotification.isSent": false,
            "whatsappNotification.status": "pending",
            "whatsappNotification.retryCount": { $lt: 3 },
          },
          {
            $set: {
              "whatsappNotification.status": "processing",
              "whatsappNotification.lastAttemptAt": new Date(),
            },
          },
          { new: true },
        );

        if (!advisory) {
          console.log("No pending advisories");
          break;
        }

        try {
          const farm = await FarmField.findById(advisory.farmFieldId).populate(
            "user",
          );

          if (!farm?.user?.phone) {
            console.log("User phone missing. Skipping...");
            advisory.whatsappNotification.status = "failed";
            advisory.whatsappNotification.error = "Phone number missing";
            await advisory.save();
            continue;
          }

          /* ================= EXTRACT ACTIVITIES ================= */

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

          // If retry left → set back to pending
          if (advisory.whatsappNotification.retryCount < 3) {
            advisory.whatsappNotification.status = "pending";
          } else {
            advisory.whatsappNotification.status = "failed";
          }

          advisory.whatsappNotification.error = metaError;

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
