import cron from "node-cron";
import axios from "axios";
import FarmAdvisory from "../models/farmadvisory.model.js";
import FarmField from "../models/fieldModel.js";
import { sendBasicEmail } from "../config/sesClient.js";

const MAX_RETRY = 3;

const WHATSAPP_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const SES_FROM_EMAIL = process.env.SES_FROM_EMAIL;

const GRAPH_URL = `https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/messages`;

const sanitize = (text = "") =>
  text.toString().replace(/\s+/g, " ").trim().substring(0, 900);

/* =====================================================
   CHECK IF DETAILS ARE VALID
===================================================== */

const hasValidDetails = (details = {}) => {
  return Object.values(details).some(
    (val) => val && val.toString().trim() !== "",
  );
};

/* =====================================================
   BUILD TEMPLATE VARIABLES
===================================================== */

const buildTemplateData = (advisory) => {
  let spray = "No spray advisory.";
  let fertigation = "No fertigation advisory.";
  let irrigation = "No irrigation advisory.";
  let weather = "No weather update.";
  let cropRisk = "No crop risk alert.";

  advisory.activitiesToDo.forEach((activity) => {
    const d = activity.details || {};
    const useDetails = hasValidDetails(d);

    switch (activity.type) {
      case "SPRAY":
        spray = useDetails
          ? sanitize(
              `${activity.title}. Chemical: ${d.chemical || "-"}, Qty: ${
                d.quantity || "-"
              }, Method: ${d.method || "-"}, Time: ${d.time || "-"}`,
            )
          : sanitize(activity.message);
        break;

      case "FERTIGATION":
        fertigation = useDetails
          ? sanitize(
              `${activity.title}. Fertilizer: ${
                d.fertilizer || "-"
              }, Qty: ${d.quantity || "-"}, Method: ${
                d.method || "-"
              }, Time: ${d.time || "-"}`,
            )
          : sanitize(activity.message);
        break;

      case "IRRIGATION":
        irrigation = useDetails
          ? sanitize(
              `${activity.title}. Water: ${d.quantity || "-"}, Method: ${
                d.method || "-"
              }, Time: ${d.time || "-"}`,
            )
          : sanitize(activity.message);
        break;

      case "WEATHER":
        weather = sanitize(activity.message);
        break;

      case "CROP_RISK":
        cropRisk = sanitize(activity.message);
        break;
    }
  });

  return { spray, fertigation, irrigation, weather, cropRisk };
};

/* =====================================================
   SEND WHATSAPP TEMPLATE
===================================================== */

const sendWhatsAppTemplate = async (to, userName, farmName, advisoryData) => {
  return axios.post(
    GRAPH_URL,
    {
      messaging_product: "whatsapp",
      to,
      type: "template",
      template: {
        name: "farm_advisory_notification",
        language: { code: "en" },
        components: [
          {
            type: "body",
            parameters: [
              { type: "text", text: userName },
              { type: "text", text: farmName },
              { type: "text", text: advisoryData.spray },
              { type: "text", text: advisoryData.fertigation },
              { type: "text", text: advisoryData.irrigation },
              { type: "text", text: advisoryData.weather },
              { type: "text", text: advisoryData.cropRisk },
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
};

/* =====================================================
   EMAIL TEMPLATE (Smart Details Handling)
===================================================== */

const buildEmailHTML = (userName, farmName, advisory) => {
  const date = new Date(advisory.createdAt).toLocaleDateString("en-GB");

  const sectionHTML = advisory.activitiesToDo
    .map((activity) => {
      const d = activity.details || {};
      const useDetails = hasValidDetails(d);

      return `
      <div style="margin-bottom:20px;padding:15px;border-radius:8px;background:#f4f6f8;">
        <h3 style="margin:0 0 10px 0;">${activity.type} 🌱</h3>
        <p><strong>${sanitize(activity.title)}</strong></p>
        <p>${sanitize(activity.message)}</p>
        ${
          useDetails
            ? `
          ${d.chemical ? `<p>🧪 <b>Chemical:</b> ${sanitize(d.chemical)}</p>` : ""}
          ${d.fertilizer ? `<p>💊 <b>Fertilizer:</b> ${sanitize(d.fertilizer)}</p>` : ""}
          ${d.quantity ? `<p>📦 <b>Quantity:</b> ${sanitize(d.quantity)}</p>` : ""}
          ${d.method ? `<p>🚜 <b>Method:</b> ${sanitize(d.method)}</p>` : ""}
          ${d.time ? `<p>⏰ <b>Time:</b> ${sanitize(d.time)}</p>` : ""}
        `
            : ""
        }
      </div>
      `;
    })
    .join("");

  return `
  <div style="font-family:Arial,sans-serif;max-width:650px;margin:auto;">
    <h2 style="color:#16a34a;">🌾 CropGen Smart Advisory</h2>
    <p>Hello <strong>${userName}</strong>,</p>
    <p><b>Farm:</b> ${farmName}</p>
    <p><b>Date:</b> ${date}</p>
    <hr/>
    ${sectionHTML}
    <hr/>
    <p style="font-weight:bold;color:#15803d;">
      Please follow the above recommendations for better crop performance 🌿
    </p>
  </div>
  `;
};

/* =====================================================
   MAIN WORKER
===================================================== */

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
          const farm = await FarmField.findById(advisory.farmFieldId)
            .populate("user")
            .lean();

          if (!farm?.user) throw new Error("User missing");

          const userName = sanitize(farm.user.firstName || "Farmer");
          const farmName = sanitize(farm.fieldName || "Your Farm");

          const advisoryData = buildTemplateData(advisory);

          if (farm.user.phone) {
            const to = farm.user.phone.replace("+", "");
            await sendWhatsAppTemplate(to, userName, farmName, advisoryData);
            console.log("📲 WhatsApp advisory sent");
          } else if (farm.user.email) {
            const html = buildEmailHTML(userName, farmName, advisory);
            await sendBasicEmail({
              to: farm.user.email,
              subject: "🌾 CropGen Smart Farm Advisory",
              html,
              from: SES_FROM_EMAIL,
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

          console.log(`✅ Advisory delivered: ${advisory._id}`);
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
