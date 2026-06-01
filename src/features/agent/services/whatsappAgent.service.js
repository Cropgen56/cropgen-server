import { createAppAgent } from "../core/agent.js";
import { getAgentOrgProfile } from "../core/systemPrompts.js";
import User from "../../../models/user.model.js";
import FarmField from "../../../models/field.model.js";
import FarmAdvisory from "../../advisory/models/farmAdvisory.model.js";
import WhatsAppMessage from "../../../models/whatsapp-message.model.js";
import { buildPhoneQueryFilter } from "../../../utils/whatsapp/phoneMatch.js";
import {
  getGlobalReplyMode,
  isAutomationActive,
} from "./whatsappSettings.service.js";
import { normalizeFarmerLanguage } from "../../../utils/language/farmerLanguages.js";

const WHATSAPP_TEXT_MAX = 4096;
const HISTORY_LIMIT = 20;
const HISTORY_TEXT_MAX = 600;

const farmerAgents = new Map();

/** Legacy static text — never feed into agent history or reuse as a reply. */
const LEGACY_STATIC_REPLY =
  "🙏 We received your message. Our agronomist will get back to you shortly.";

export function isWhatsAppAgentEnabled() {
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

export async function logWhatsAppAgentStatus() {
  const hasKey = Boolean(String(process.env.OPENAI_API_KEY ?? "").trim());
  const mode = await getGlobalReplyMode();
  const active = await isAutomationActive();
  console.log(
    `[WhatsApp agent] globalMode=${mode} automationActive=${active} openai=${hasKey ? "configured" : "missing"} env=${process.env.WHATSAPP_AGENT_AUTO_REPLY ?? "(default)"}`,
  );
}

function truncateText(text, max) {
  const s = String(text || "").trim();
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1)}…`;
}

function isSkippableOutboundForHistory(msg) {
  if (msg.direction !== "OUT") return false;
  if (msg.source === "auto_reply") return true;
  const t = String(msg.text || "").trim();
  return (
    t === LEGACY_STATIC_REPLY ||
    t.startsWith("Thanks for your message. Our agronomist") ||
    t.startsWith("🙏 We received your message")
  );
}

function compactMessageForHistory(msg) {
  if (isSkippableOutboundForHistory(msg)) return "";

  if (msg.source === "advisory_template" || msg.source === "advisory_custom") {
    const when = msg.timestamp || msg.createdAt;
    const dateStr = when
      ? new Date(when).toISOString().slice(0, 10)
      : "recently";
    return `[Farm advisory was sent on ${dateStr}]`;
  }
  const raw = String(msg.text || "").trim();
  if (!raw) return "";
  if (raw.startsWith("[") && raw.endsWith("]") && raw.length < 80) return "";
  return truncateText(raw, HISTORY_TEXT_MAX);
}

async function getLatestAdvisoryByFarmId(farms) {
  const map = {};
  if (!farms?.length) return map;
  await Promise.all(
    farms.map(async (f) => {
      const id = f._id?.toString?.();
      if (!id) return;
      const doc = await FarmAdvisory.findOne({ farmFieldId: f._id })
        .sort({ createdAt: -1 })
        .lean();
      if (doc) map[id] = doc;
    }),
  );
  return map;
}

async function loadConversationSeed(farmerId, phone, excludeWaMessageId) {
  const rows = await WhatsAppMessage.find({
    farmerId,
    ...buildPhoneQueryFilter(phone),
    text: { $exists: true },
  })
    .sort({ createdAt: -1 })
    .limit(HISTORY_LIMIT + 4)
    .select("direction text source timestamp createdAt waMessageId")
    .lean();

  const chronological = rows.reverse();
  const pairs = [];

  for (const msg of chronological) {
    if (excludeWaMessageId && msg.waMessageId === excludeWaMessageId) {
      continue;
    }
    const content = compactMessageForHistory(msg);
    if (!content) continue;
    pairs.push({
      role: msg.direction === "IN" ? "user" : "assistant",
      content,
    });
  }

  return pairs.slice(-HISTORY_LIMIT);
}

async function getOrCreateAgent(farmer) {
  const farmerId = farmer._id.toString();
  const cached = farmerAgents.get(farmerId);
  if (cached) return cached;

  const user = await User.findById(farmer._id)
    .populate("organization", "organizationCode")
    .lean();

  const farms = await FarmField.find({ user: farmer._id }).lean();
  const userName =
    [user?.firstName, user?.lastName].filter(Boolean).join(" ") || "Farmer";
  const orgCode = user?.organization?.organizationCode || "CROPGEN";
  const advisoryByFarmId = await getLatestAdvisoryByFarmId(farms);

  const agent = createAppAgent(userName, farms, {
    advisoryByFarmId,
    organizationCode: orgCode,
    channel: "whatsapp",
    language: normalizeFarmerLanguage(user?.language),
  });

  farmerAgents.set(farmerId, agent);
  return agent;
}

/**
 * Generate an AI reply for an inbound WhatsApp message from a registered farmer.
 * @returns {Promise<{ text: string, source: "agent_reply"|"auto_reply" }|null>}
 */
async function invokeAgent(agent, userText, farmer) {
  const todayISO = new Date().toISOString().slice(0, 10);
  const input = `[Current date (server): ${todayISO}]\n[Channel: WhatsApp]\n\n${userText}`;
  const { response } = await agent.call({ input });
  let reply = truncateText(String(response || "").trim(), WHATSAPP_TEXT_MAX);

  const isBad =
    !reply ||
    reply === LEGACY_STATIC_REPLY ||
    reply.startsWith("🙏 We received your message");

  if (isBad) {
    const retryInput = `${input}\n\n(Reply as the farm assistant: greet briefly, use their registered farm data when relevant, and answer their question. Do NOT say an agronomist will get back later.)`;
    const retry = await agent.call({ input: retryInput });
    reply = truncateText(String(retry?.response || "").trim(), WHATSAPP_TEXT_MAX);
  }

  if (
    !reply ||
    reply === LEGACY_STATIC_REPLY ||
    reply.startsWith("🙏 We received your message")
  ) {
    const user = await User.findById(farmer._id)
      .populate("organization", "organizationCode")
      .lean();
    const profile = getAgentOrgProfile(
      user?.organization?.organizationCode || "CROPGEN",
    );
    reply = profile.incompleteReplyText;
  }

  return reply;
}

export async function generateWhatsAppAgentReply({
  farmer,
  phone,
  userText,
  waMessageId,
}) {
  const globalMode = await getGlobalReplyMode();
  if (globalMode === "manual") {
    console.log("[WhatsApp agent] Global mode is manual — no auto reply");
    return null;
  }

  if (!(await isAutomationActive())) {
    console.warn(
      "[WhatsApp agent] Automation inactive (env or OpenAI) — no outbound message",
    );
    return null;
  }

  const text = String(userText || "").trim();
  if (!text || text.startsWith("[")) {
    return null;
  }

  const farmerId = farmer._id.toString();
  clearWhatsAppAgentCache(farmerId);

  const agent = await getOrCreateAgent(farmer);
  const seed = await loadConversationSeed(farmer._id, phone, waMessageId);

  if (seed.length > 0 && typeof agent.preloadHistory === "function") {
    await agent.preloadHistory(seed);
  }

  console.log(
    `[WhatsApp agent] Generating reply farmer=${farmerId} seed=${seed.length} text="${text.slice(0, 40)}"`,
  );

  const reply = await invokeAgent(agent, text, farmer);
  return { text: reply, source: "agent_reply" };
}

export function clearWhatsAppAgentCache(farmerId) {
  if (farmerId) farmerAgents.delete(String(farmerId));
  else farmerAgents.clear();
}
