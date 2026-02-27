import cron from "node-cron";
import FarmAdvisory from "../models/farmadvisory.model.js";
import FarmField from "../models/fieldModel.js";
import axios from "axios";

const MAX_RETRY = 3;

const WHATSAPP_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;

const GRAPH_URL = `https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/messages`;

const sanitize = (text = "") => text.toString().replace(/\s+/g, " ").trim();

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

          const userName = sanitize(farm.user.firstName || "Farmer");

          const farmName = sanitize(farm.fieldName || "Your Farm");

          /* ================= BUILD TEMPLATE VARIABLES ================= */

          let spray = "No spray advisory.";
          let fertigation = "No fertigation advisory.";
          let irrigation = "No irrigation advisory.";
          let weather = "No weather update.";
          let cropRisk = "No crop risk alert.";

          advisory.activitiesToDo.forEach((activity) => {
            const d = activity.details || {};

            switch (activity.type) {
              case "SPRAY":
                spray = sanitize(
                  `${activity.title || ""} - Chemical: ${
                    d.chemical || "-"
                  }, Qty: ${d.quantity || "-"}, Method: ${
                    d.method || "-"
                  }, Time: ${d.time || "-"}`,
                );
                break;

              case "FERTIGATION":
                fertigation = sanitize(
                  `${activity.title || ""} - Fertilizer: ${
                    d.fertilizer || "-"
                  }, Qty: ${d.quantity || "-"}, Method: ${
                    d.method || "-"
                  }, Time: ${d.time || "-"}`,
                );
                break;

              case "IRRIGATION":
                irrigation = sanitize(
                  `${activity.title || ""} - Water: ${
                    d.quantity || "-"
                  }, Method: ${d.method || "-"}, Time: ${d.time || "-"}`,
                );
                break;

              case "WEATHER":
                weather = sanitize(activity.message || "-");
                break;

              case "CROP_RISK":
                cropRisk = sanitize(activity.message || "-");
                break;
            }
          });

          /* ================= WHATSAPP TEMPLATE PAYLOAD ================= */

          const payload = {
            messaging_product: "whatsapp",
            to: farm.user.phone.replace("+", ""),
            type: "template",
            template: {
              name: "farm_advisory_notification",
              language: { code: "en" }, // must match template language
              components: [
                {
                  type: "body",
                  parameters: [
                    { type: "text", text: userName }, // {{1}}
                    { type: "text", text: farmName }, // {{2}}
                    { type: "text", text: spray }, // {{3}}
                    { type: "text", text: fertigation }, // {{4}}
                    { type: "text", text: irrigation }, // {{5}}
                    { type: "text", text: weather }, // {{6}}
                    { type: "text", text: cropRisk }, // {{7}}
                  ],
                },
              ],
            },
          };

          await axios.post(GRAPH_URL, payload, {
            headers: {
              Authorization: `Bearer ${WHATSAPP_TOKEN}`,
              "Content-Type": "application/json",
            },
          });

          advisory.whatsappNotification.isSent = true;
          advisory.whatsappNotification.status = "sent";
          advisory.whatsappNotification.sentAt = new Date();
          advisory.whatsappNotification.error = null;

          await advisory.save();

          console.log(`✅ Advisory sent: ${advisory._id}`);
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
