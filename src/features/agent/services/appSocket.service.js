import { createAppAgent, isGenericAgentFailure } from "../core/agent.js";
import { getAgentOrgProfile } from "../core/systemPrompts.js";
import User from "../../../models/user.model.js";
import FarmField from "../../../models/field.model.js";
import FarmAdvisory from "../../advisory/models/farmAdvisory.model.js";
import AppUserChat from "../../../models/app-user-chat.model.js";
import { formatAcresTwoDecimals } from "../../../utils/format/acres.js";
import { normalizeFarmerLanguage } from "../../../utils/language/farmerLanguages.js";

const userAgents = new Map();
/** Last client brand used to build this user's agent (`CROPGEN` | `BIODROPS`). */
const userAgentOrgCodes = new Map();
/** `general` or farm field id — skip rebuild when the farmer taps the same chip. */
const userActiveFarmKey = new Map();

const GENERAL_ACK =
  "General farming mode. Ask about practices, crops, pests, irrigation, soil, or weather in your region — not tied to a specific field.";

function resolveAppAgentOrgCode(user, override) {
  const fromClient = String(override || "")
    .trim()
    .toUpperCase();
  if (fromClient === "CROPGEN") return "CROPGEN";
  if (fromClient === "BIODROPS" || fromClient === "SATAGRO") return "BIODROPS";
  return String(user?.organization?.organizationCode || "CROPGEN").toUpperCase();
}

const MAX_PERSISTED_MESSAGES = 100;
const MAX_SEEDED_HISTORY = 16;

function isSystemFarmAck(text) {
  const t = String(text || "").trim();
  if (t.startsWith("Showing all your farms:")) return true;
  if (/^Now discussing /i.test(t)) return true;
  if (/^General farming mode/i.test(t)) return true;
  if (/^Conversation reset/i.test(t)) return true;
  return false;
}

async function seedAgentHistory(agent, userId) {
  if (!agent?.preloadHistory) return;
  try {
    const chat = await AppUserChat.findOne({ user: userId }).lean();
    const rows = Array.isArray(chat?.messages) ? chat.messages : [];
    const pairs = rows
      .filter((m) => {
        const text = String(m?.text || "").trim();
        if (!text) return false;
        if (isSystemFarmAck(text)) return false;
        if (/don'?t have (direct |real-?time )?(access|weather)/i.test(text)) {
          return false;
        }
        return true;
      })
      .slice(-MAX_SEEDED_HISTORY)
      .map((m) => ({
        role: m.sender === "user" ? "user" : "assistant",
        content: String(m.text).trim(),
      }))
      .filter((p) => p.content);
    if (pairs.length) await agent.preloadHistory(pairs);
  } catch (err) {
    console.error("Failed to seed agent chat history:", err);
  }
}

/**
 * Latest advisory document per farm (for agent system prompt).
 */
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

function fallbackWelcome({ userName, profile, farms }) {
  if (!farms.length) {
    return `Hi ${userName}! I'm your ${profile.assistantTitle}. Ask me anything about farming, or add a farm from the dashboard for field-specific advice.`;
  }
  return `Hi ${userName}! I'm your ${profile.assistantTitle}. Tap General for farming practices, or a farm above for field-specific advice.`;
}

function normalizeAgentReply(res) {
  const reply = res?.response ?? "Sorry, I didn't understand that.";
  if (isGenericAgentFailure(reply)) {
    return "I'm having trouble reaching the AI service right now. Please try again in a moment.";
  }
  return reply;
}

class AppSocketService {
  /**
   * Load user profile + farms, build a personalised agent, return welcome message.
   */
  async initializeUser(userId, agentOptions = {}) {
    const user = await User.findById(userId)
      .populate("organization", "organizationCode")
      .lean();
    const farms = await FarmField.find({ user: userId }).lean();

    const userName =
      [user?.firstName, user?.lastName].filter(Boolean).join(" ") || "Farmer";

    const orgCode = resolveAppAgentOrgCode(
      user,
      agentOptions.organizationCode ?? userAgentOrgCodes.get(userId),
    );
    userAgentOrgCodes.set(userId, orgCode);
    const profile = getAgentOrgProfile(orgCode);
    const language = normalizeFarmerLanguage(user?.language);

    const agent = createAppAgent(userName, [], {
      advisoryByFarmId: {},
      organizationCode: orgCode,
      language,
      farmerUser: user,
      conversationMode: "general",
    });
    userAgents.set(userId, agent);
    userActiveFarmKey.set(userId, "general");

    return fallbackWelcome({ userName, profile, farms });
  }

  async handleMessage(userId, message) {
    const ai = userAgents.get(userId);
    if (!ai) {
      try {
        await this.initializeUser(userId, {
          organizationCode: userAgentOrgCodes.get(userId),
        });
        const ai2 = userAgents.get(userId);
        if (ai2) {
          const todayISO = new Date().toISOString().slice(0, 10);
          const input = `[Current date (server): ${todayISO}]\n\n${message}`;
          const res = await ai2.call({ input });
          return normalizeAgentReply(res);
        }
      } catch (err) {
        console.error("Re-init failed:", err);
      }
      return "Session expired. Please refresh the page.";
    }
    try {
      const todayISO = new Date().toISOString().slice(0, 10);
      const input = `[Current date (server): ${todayISO}]\n\n${message}`;
      const res = await ai.call({ input });
      return normalizeAgentReply(res);
    } catch (err) {
      console.error("App AI call error:", err);
      return "I'm having trouble reaching the AI service right now. Please try again in a moment.";
    }
  }

  async recordMessage(userId, sender, text) {
    try {
      await AppUserChat.findOneAndUpdate(
        { user: userId },
        {
          $push: {
            messages: {
              $each: [{ sender, text, ts: new Date() }],
              $slice: -MAX_PERSISTED_MESSAGES,
            },
          },
          $set: { updatedAt: new Date() },
        },
        { upsert: true, new: true }
      );
    } catch (err) {
      console.error("Failed to persist app chat:", err);
    }
  }

  async resetConversation(userId, agentOptions = {}) {
    userAgents.delete(userId);
    try {
      await this.initializeUser(userId, {
        organizationCode:
          agentOptions.organizationCode ?? userAgentOrgCodes.get(userId),
      });
    } catch (err) {
      console.error("Reset re-init failed:", err);
    }
  }

  /**
   * Narrow or broaden the AI context to one field (or all farms if fieldId is null/invalid).
   * Call from socket event `set_active_farm` after the client loads farm list.
   */
  async setActiveFarm(userId, fieldId, agentOptions = {}) {
    const isGeneralMode =
      !fieldId ||
      fieldId === "general" ||
      fieldId === "__all__" ||
      String(fieldId).toLowerCase() === "null";
    const guessedKey = isGeneralMode ? "general" : String(fieldId);

    if (
      guessedKey &&
      userActiveFarmKey.get(userId) === guessedKey &&
      userAgents.has(userId)
    ) {
      return isGeneralMode ? GENERAL_ACK : "Now discussing this field.";
    }

    const user = await User.findById(userId)
      .populate("organization", "organizationCode")
      .lean();
    if (!user) {
      return "Could not load your profile. Please try again.";
    }

    const allFarms = await FarmField.find({ user: userId }).lean();
    const userName =
      [user?.firstName, user?.lastName].filter(Boolean).join(" ") || "Farmer";

    const orgCode = resolveAppAgentOrgCode(
      user,
      agentOptions.organizationCode ?? userAgentOrgCodes.get(userId),
    );
    userAgentOrgCodes.set(userId, orgCode);

    let farmsForAgent = [];
    if (!isGeneralMode) {
      const sid = String(fieldId);
      const match = allFarms.find((f) => f._id.toString() === sid);
      farmsForAgent = match ? [match] : [];
    }

    const nextKey = isGeneralMode
      ? "general"
      : String(farmsForAgent[0]?._id || "");

    const language = normalizeFarmerLanguage(user?.language);
    const advisoryByFarmId = isGeneralMode
      ? {}
      : await getLatestAdvisoryByFarmId(farmsForAgent);
    const agent = createAppAgent(userName, farmsForAgent, {
      advisoryByFarmId,
      organizationCode: orgCode,
      language,
      farmerUser: user,
      conversationMode: isGeneralMode ? "general" : "farm",
    });
    userAgents.set(userId, agent);
    userActiveFarmKey.set(userId, nextKey || "general");
    if (!isGeneralMode) {
      await seedAgentHistory(agent, userId);
    }

    if (isGeneralMode) {
      return GENERAL_ACK;
    }

    if (farmsForAgent.length === 1) {
      const f = farmsForAgent[0];
      const acres = formatAcresTwoDecimals(f.acre);
      return `Now discussing ${f.fieldName} (${f.cropName}, ${acres} acre). What would you like to know?`;
    }

    return "Could not switch farm context. Please try again.";
  }

  async getChatHistory(userId) {
    try {
      const chat = await AppUserChat.findOne({ user: userId }).lean();
      return chat?.messages || [];
    } catch (err) {
      console.error("Error fetching app chat history:", err);
      return [];
    }
  }

  cleanupUser(userId) {
    userAgents.delete(userId);
    userActiveFarmKey.delete(userId);
  }
}

export default new AppSocketService();
