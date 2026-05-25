import WhatsAppSettings from "../../../models/whatsapp-settings.model.js";

function isEnvAgentEnabled() {
  const flag = String(process.env.WHATSAPP_AGENT_AUTO_REPLY ?? "")
    .trim()
    .toLowerCase();
  if (flag === "false" || flag === "0" || flag === "off" || flag === "no") {
    return false;
  }
  if (flag === "true" || flag === "1" || flag === "on" || flag === "yes") {
    return true;
  }
  return Boolean(String(process.env.OPENAI_API_KEY ?? "").trim());
}

const GLOBAL_ID = WhatsAppSettings.GLOBAL_ID;
const CACHE_TTL_MS = 30_000;

let cached = null;
let cacheAt = 0;

function isOpenAiConfigured() {
  return Boolean(String(process.env.OPENAI_API_KEY ?? "").trim());
}

async function loadSettingsDoc() {
  const now = Date.now();
  if (cached && now - cacheAt < CACHE_TTL_MS) {
    return cached;
  }

  let doc = await WhatsAppSettings.findById(GLOBAL_ID).lean();
  if (!doc) {
    doc = (
      await WhatsAppSettings.findByIdAndUpdate(
        GLOBAL_ID,
        { $setOnInsert: { replyMode: "automation" } },
        { upsert: true, new: true },
      )
    ).toObject();
  }

  cached = doc;
  cacheAt = now;
  return doc;
}

export function invalidateWhatsAppSettingsCache() {
  cached = null;
  cacheAt = 0;
}

export async function getGlobalReplyMode() {
  const doc = await loadSettingsDoc();
  return doc.replyMode === "manual" ? "manual" : "automation";
}

export async function isAutomationActive() {
  const mode = await getGlobalReplyMode();
  return mode === "automation" && isEnvAgentEnabled();
}

export async function getWhatsAppAgentSettingsPayload() {
  const doc = await loadSettingsDoc();
  const replyMode = doc.replyMode === "manual" ? "manual" : "automation";
  const openaiConfigured = isOpenAiConfigured();
  const envAgentEnabled = isEnvAgentEnabled();

  return {
    replyMode,
    automationActive:
      replyMode === "automation" && envAgentEnabled && openaiConfigured,
    openaiConfigured,
    envAgentEnabled,
    updatedAt: doc.updatedAt,
  };
}

export async function setGlobalReplyMode(mode, adminUserId = null) {
  const normalized = mode === "manual" ? "manual" : "automation";

  await WhatsAppSettings.findByIdAndUpdate(
    GLOBAL_ID,
    {
      $set: {
        replyMode: normalized,
        ...(adminUserId ? { updatedBy: adminUserId } : {}),
      },
      $setOnInsert: { _id: GLOBAL_ID },
    },
    { upsert: true, new: true },
  );

  invalidateWhatsAppSettingsCache();
  console.log(
    `[WhatsApp settings] Global reply mode set to ${normalized}${adminUserId ? ` by ${adminUserId}` : ""}`,
  );

  return getWhatsAppAgentSettingsPayload();
}
