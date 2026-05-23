/**
 * Generate farm advisories for one or more fields and deliver via WhatsApp + email.
 *
 * Usage (from cropgen-server/):
 *   node scripts/generate-and-send-advisory.mjs
 *   node scripts/generate-and-send-advisory.mjs --field-ids=6a0c2a63c6171e88a2ecd4b6,6a10863a303f1f2b671cf0e6
 *   node scripts/generate-and-send-advisory.mjs --dry-run
 *   node scripts/generate-and-send-advisory.mjs --language=hi --skip-email
 *
 * Requires: MONGO_URI, Observearth/satellite env, OPENAI, WHATSAPP_*, SES_* in .env
 */

import dotenv from "dotenv";
import mongoose from "mongoose";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DEFAULT_FIELD_IDS = [
  "6a0c2a63c6171e88a2ecd4b6", // Field 1 — sugarcane
  "6a10863a303f1f2b671cf0e6", // Sugarcane Pal Farm
];

const ACRE_TO_HA = 0.404686;

function parseArgs(argv) {
  const opts = {
    fieldIds: [...DEFAULT_FIELD_IDS],
    language: null,
    platform: "web",
    dryRun: false,
    skipWhatsapp: false,
    skipEmail: false,
  };

  for (const arg of argv) {
    if (arg === "--dry-run") opts.dryRun = true;
    if (arg === "--skip-whatsapp") opts.skipWhatsapp = true;
    if (arg === "--skip-email") opts.skipEmail = true;
    if (arg.startsWith("--field-ids=")) {
      opts.fieldIds = arg
        .slice("--field-ids=".length)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    }
    if (arg.startsWith("--language=")) {
      opts.language = arg.slice("--language=".length).trim();
    }
    if (arg.startsWith("--platform=")) {
      opts.platform = arg.slice("--platform=".length).trim();
    }
  }

  return opts;
}

function formatAreaForNotification(acre, platform = "web") {
  const value = Number(acre);
  if (!Number.isFinite(value) || value < 0) {
    return platform === "web" ? "0 ha" : "0 Acre";
  }
  if (platform === "web") {
    return `${(value * ACRE_TO_HA).toFixed(2)} ha`;
  }
  return `${(Math.round(value * 100) / 100).toFixed(2)} Acre`;
}

function buildAdvisoryParameters(user, farmField, advisory, platform) {
  const advisoryDateObj = advisory?.createdAt
    ? new Date(advisory.createdAt)
    : new Date();
  const advisoryDateStr = advisoryDateObj
    .toISOString()
    .slice(0, 10)
    .split("-")
    .reverse()
    .join("-");

  const advisoryData = {
    spray: "No spray advisory.",
    fertigation: "No fertigation advisory.",
    irrigation: "No irrigation advisory.",
    weather: "No weather update.",
    cropRisk: "No crop risk alert.",
    monitoring: "No monitoring advice.",
    carbonUpdate: "No carbon update.",
  };

  for (const activity of advisory?.activitiesToDo || []) {
    switch (activity.type) {
      case "SPRAY":
        advisoryData.spray = activity.message;
        break;
      case "FERTIGATION":
        advisoryData.fertigation = activity.message;
        break;
      case "IRRIGATION":
        advisoryData.irrigation = activity.message;
        break;
      case "WEATHER":
        advisoryData.weather = activity.message;
        break;
      case "CROP_RISK":
        advisoryData.cropRisk = activity.message;
        break;
      case "MONITORING":
        advisoryData.monitoring = activity.message;
        break;
      case "CARBON_TRACKING":
        advisoryData.carbonUpdate = activity.message;
        break;
      default:
        break;
    }
  }

  return [
    user.firstName || "Farmer",
    advisoryDateStr,
    farmField.cropName || "Crop",
    farmField.fieldName || "Field",
    formatAreaForNotification(farmField.acre, platform),
    advisoryData.spray,
    advisoryData.fertigation,
    advisoryData.irrigation,
    advisoryData.weather,
    advisoryData.cropRisk,
    advisoryData.monitoring,
    advisoryData.carbonUpdate,
  ];
}

async function markPendingNotificationsSent(advisoryId) {
  const Notification = (
    await import("../src/models/notification.model.js")
  ).default;
  await Notification.updateMany(
    {
      referenceId: advisoryId,
      type: "ADVISORY",
      status: { $in: ["pending", "processing", "failed"] },
    },
    {
      $set: {
        status: "sent",
        error: null,
      },
    },
  );
}

async function processField(farmFieldId, opts, deps) {
  const {
    FarmField,
    User,
    generateAdvisoryForField,
    resolveAOIForFarm,
    sendCustomWhatsAppMessage,
    formatFarmAdvisoryMessage,
    sendWhatsAppTemplate,
    generateEmailFromTemplate,
    sendEmail,
    WhatsAppMessage,
  } = deps;

  console.log(`\n${"=".repeat(60)}`);
  console.log(`Field: ${farmFieldId}`);
  console.log("=".repeat(60));

  const farm = await FarmField.findById(farmFieldId).populate(
    "user",
    "firstName lastName email phone language",
  );

  if (!farm) {
    console.error("  ❌ Farm field not found");
    return { farmFieldId, ok: false, error: "Farm not found" };
  }

  const user = farm.user;
  if (!user) {
    console.error("  ❌ No user linked to this field");
    return { farmFieldId, ok: false, error: "User not found" };
  }

  console.log(
    `  Farm: ${farm.fieldName} (${farm.cropName}) — ${farm.acre} acre`,
  );
  console.log(
    `  Farmer: ${user.firstName} ${user.lastName || ""} | ${user.phone || "no phone"} | ${user.email || "no email"}`,
  );

  const language = opts.language || user.language || "en";

  if (opts.dryRun) {
    console.log("  [dry-run] Would generate advisory and send notifications");
    return { farmFieldId, ok: true, dryRun: true };
  }

  let advisory;
  try {
    console.log("  ⏳ Resolving AOI / weather geometry…");
    const { aoiId, created } = await resolveAOIForFarm(farm);
    if (created) console.log(`  ✓ Created AOI ${aoiId}`);
    else console.log(`  ✓ Using existing AOI ${aoiId}`);

    console.log("  ⏳ Generating advisory (satellite + LLM)…");
    advisory = await generateAdvisoryForField(
      farm._id,
      aoiId,
      language,
      opts.platform,
    );
    console.log(`  ✓ Advisory saved: ${advisory._id}`);
  } catch (err) {
    const detail = err.response
      ? `${err.message} → ${err.config?.url || "external API"} (${JSON.stringify(err.response.data || "").slice(0, 200)})`
      : err.message;
    console.error("  ❌ Advisory generation failed:", detail);
    return { farmFieldId, ok: false, error: detail };
  }

  const parameters = buildAdvisoryParameters(
    user,
    farm,
    advisory,
    opts.platform,
  );

  const results = { whatsapp: null, email: null };

  if (!opts.skipWhatsapp && user.phone) {
    const phoneDigits = user.phone.replace(/\D/g, "");
    const formattedMessage = formatFarmAdvisoryMessage(
      advisory.activitiesToDo || [],
      farm,
      user,
    );

    console.log("  ⏳ Sending WhatsApp (custom text)…");
    const waResult = await sendCustomWhatsAppMessage(phoneDigits, formattedMessage);

    if (waResult.success) {
      await WhatsAppMessage.create({
        advisoryId: advisory._id,
        farmerId: user._id,
        phone: phoneDigits,
        direction: "OUT",
        messageType: "text",
        text: formattedMessage,
        rawPayload: waResult.data,
      });
      console.log(`  ✓ WhatsApp sent (messageId: ${waResult.messageId || "—"})`);
      results.whatsapp = "sent";
    } else {
      console.warn(
        "  ⚠️ Custom WhatsApp failed, trying template…",
        waResult.error?.message || waResult.error,
      );
      try {
        const tpl = await sendWhatsAppTemplate({
          to: phoneDigits,
          templateName: "farm_advisory",
          languageCode: language === "hi" ? "hi" : "en",
          parameters,
        });
        console.log(
          `  ✓ WhatsApp template sent (${tpl?.data?.messages?.[0]?.id || "ok"})`,
        );
        results.whatsapp = "template_sent";
      } catch (tplErr) {
        console.error(
          "  ❌ WhatsApp template also failed:",
          tplErr.response?.data?.error?.message || tplErr.message,
        );
        results.whatsapp = "failed";
      }
    }
  } else if (!user.phone) {
    console.warn("  ⚠️ Skipping WhatsApp — user has no phone");
    results.whatsapp = "skipped_no_phone";
  }

  if (!opts.skipEmail && user.email) {
    console.log(`  ⏳ Sending email to ${user.email}…`);
    try {
      const { subject, html } = generateEmailFromTemplate(
        "farm_advisory",
        parameters,
        advisory.createdAt,
      );
      await sendEmail({ to: user.email, subject, html });
      console.log("  ✓ Email sent");
      results.email = "sent";
    } catch (err) {
      console.error("  ❌ Email failed:", err.message);
      results.email = "failed";
    }
  } else if (!user.email) {
    console.warn("  ⚠️ Skipping email — user has no email");
    results.email = "skipped_no_email";
  }

  await markPendingNotificationsSent(advisory._id);
  console.log("  ✓ Marked pending queue notifications as sent (no duplicate from worker)");

  return {
    farmFieldId,
    fieldName: farm.fieldName,
    ok: true,
    advisoryId: String(advisory._id),
    results,
  };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  console.log("CropGen — Generate & send farm advisories");
  console.log("Fields:", opts.fieldIds.join(", "));
  if (opts.dryRun) console.log("Mode: DRY RUN");

  if (!process.env.MONGO_URI) {
    console.error("MONGO_URI is missing in .env");
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI);
  console.log("Connected to MongoDB\n");

  const FarmField = (await import("../src/models/field.model.js")).default;
  await import("../src/models/user.model.js");
  await import("../src/models/organization.model.js");

  const { generateAdvisoryForField } = await import(
    "../src/features/advisory/services/advisory.service.js"
  );
  const { resolveAOIForFarm } = await import(
    "../src/utils/weather/weather.utils.js"
  );
  const { sendCustomWhatsAppMessage } = await import(
    "../src/services/whatsappService.js"
  );
  const { sendWhatsAppTemplate } = await import(
    "../src/services/whatsapp.service.js"
  );
  const { formatFarmAdvisoryMessage } = await import(
    "../src/utils/whatsapp.utils.js"
  );
  const { generateEmailFromTemplate, sendEmail } = await import(
    "../src/services/email.services.js"
  );
  const WhatsAppMessage = (
    await import("../src/models/whatsappmessage.model.js")
  ).default;

  const deps = {
    FarmField,
    User: mongoose.model("User"),
    generateAdvisoryForField,
    resolveAOIForFarm,
    sendCustomWhatsAppMessage,
    formatFarmAdvisoryMessage,
    sendWhatsAppTemplate,
    generateEmailFromTemplate,
    sendEmail,
    WhatsAppMessage,
  };

  const summary = [];
  for (const fieldId of opts.fieldIds) {
    summary.push(await processField(fieldId, opts, deps));
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log("SUMMARY");
  console.log("=".repeat(60));
  for (const row of summary) {
    if (row.dryRun) {
      console.log(`  ${row.farmFieldId}: dry-run OK`);
    } else if (row.ok) {
      console.log(
        `  ✓ ${row.fieldName || row.farmFieldId} → advisory ${row.advisoryId}`,
      );
      console.log(`      WhatsApp: ${row.results?.whatsapp} | Email: ${row.results?.email}`);
    } else {
      console.log(`  ✗ ${row.farmFieldId}: ${row.error}`);
    }
  }

  await mongoose.disconnect();
  const failed = summary.filter((r) => !r.ok && !r.dryRun);
  process.exit(failed.length ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  mongoose.disconnect().finally(() => process.exit(1));
});
