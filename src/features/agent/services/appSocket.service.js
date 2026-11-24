import { createAppAgent, isGenericAgentFailure } from "../core/agent.js";
import { getAgentOrgProfile } from "../core/systemPrompts.js";
import User from "../../../models/user.model.js";
import FarmField from "../../../models/field.model.js";
import AppUserChat from "../../../models/app-user-chat.model.js";
import { formatAcresTwoDecimals } from "../../../utils/format/acres.js";
import { normalizeFarmerLanguage } from "../../../utils/language/farmerLanguages.js";
import { attachCropContextToFarms } from "../utils/agentCropContext.js";
import { buildFarmerContext } from "../utils/farmerContext.js";
import { getNotice } from "../utils/noticeText.js";

const userAgents = new Map();
/** Last client brand used to build this user's agent (`CROPGEN` | `BIODROPS`). */
const userAgentOrgCodes = new Map();
/** `all` | `general` | farm field id — skip rebuild when the farmer taps the same chip. */
const userActiveFarmKey = new Map();
/** Profile language last used to build the user's agent (for server-written messages). */
const userLanguages = new Map();
/** Users whose profile the agent just changed — the socket layer tells their app to refresh. */
const profileSavedUsers = new Set();

/** How many farms are described to the agent in "all farms" mode (keeps the prompt bounded). */
const MAX_FARMS_IN_PROMPT = 12;

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

const cropLabelOf = (f) =>
  Array.isArray(f.crops) && f.crops.length
    ? f.crops.map((c) => c.cropName).join(" + ")
    : f.cropName || "";

async function normalizeAgentReply(res, language) {
  const reply = res?.response ?? "Sorry, I didn't understand that.";
  if (isGenericAgentFailure(reply)) {
    return getNotice("ai_down", language);
  }
  return reply;
}

class AppSocketService {
  /** Profile, farms and org/language settings shared by every agent build. */
  async _prepare(userId, agentOptions = {}) {
    const user = await User.findById(userId)
      .populate("organization", "organizationCode")
      .lean();
    const allFarms = await FarmField.find({ user: userId }).lean();
    const userName =
      [user?.firstName, user?.lastName].filter(Boolean).join(" ") || "Farmer";
    const orgCode = resolveAppAgentOrgCode(
      user,
      agentOptions.organizationCode ?? userAgentOrgCodes.get(userId),
    );
    userAgentOrgCodes.set(userId, orgCode);
    const language = normalizeFarmerLanguage(user?.language);
    userLanguages.set(String(userId), language);
    return {
      user,
      allFarms,
      userName,
      orgCode,
      language,
      profile: getAgentOrgProfile(orgCode),
    };
  }

  /**
   * Build the agent for one mode:
   *   general — no farm data;  all — every farm (default);  farm — a single field.
   * @returns the farms (with active crops) given to the agent
   */
  async _buildAgent(userId, ctx, mode, farmDocs) {
    const isGeneral = mode === "general";
    const { farms, advisoryByCropId, advisoryByFarmId } = isGeneral
      ? { farms: [], advisoryByCropId: {}, advisoryByFarmId: {} }
      : await attachCropContextToFarms(farmDocs);

    const agent = createAppAgent(ctx.userName, farms, {
      advisoryByCropId,
      advisoryByFarmId,
      organizationCode: ctx.orgCode,
      language: ctx.language,
      farmerUser: ctx.user,
      userId,
      onProfileSaved: () => profileSavedUsers.add(String(userId)),
      farmerContext: buildFarmerContext(
        ctx.user,
        mode === "all" ? farms : ctx.allFarms,
      ),
      conversationMode: isGeneral ? "general" : "farm",
    });
    userAgents.set(userId, agent);
    if (!isGeneral) await seedAgentHistory(agent, userId);
    return farms;
  }

  /**
   * Load user profile + farms and build the personalised agent. Farmers with farms start in
   * "all farms" mode; farmers without any start in general mode. Returns the welcome message
   * in the farmer's profile language.
   */
  async initializeUser(userId, agentOptions = {}) {
    const ctx = await this._prepare(userId, agentOptions);
    const hasFarms = ctx.allFarms.length > 0;
    await this._buildAgent(
      userId,
      ctx,
      hasFarms ? "all" : "general",
      ctx.allFarms.slice(0, MAX_FARMS_IN_PROMPT),
    );
    userActiveFarmKey.set(userId, hasFarms ? "all" : "general");

    return getNotice(hasFarms ? "welcome_farms" : "welcome_nofarm", ctx.language, {
      name: ctx.userName,
      title: ctx.profile.assistantTitle,
    });
  }

  async handleMessage(userId, message) {
    const lang = () => userLanguages.get(String(userId));
    let ai = userAgents.get(userId);
    if (!ai) {
      try {
        await this.initializeUser(userId, {
          organizationCode: userAgentOrgCodes.get(userId),
        });
        ai = userAgents.get(userId);
      } catch (err) {
        console.error("Re-init failed:", err);
      }
      if (!ai) return getNotice("session_expired", lang());
    }
    try {
      const todayISO = new Date().toISOString().slice(0, 10);
      const input = `[Current date (server): ${todayISO}]\n\n${message}`;
      const res = await ai.call({ input });
      return await normalizeAgentReply(res, lang());
    } catch (err) {
      console.error("App AI call error:", err);
      return getNotice("ai_down", lang());
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

  /** Rebuilds the agent (all-farms mode) and returns the "conversation reset" notice. */
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
    return getNotice("reset", userLanguages.get(String(userId)));
  }

  /** A server-written message in the farmer's profile language. */
  async notice(userId, key, vars) {
    return getNotice(key, userLanguages.get(String(userId)), vars);
  }

  /**
   * Switch what the agent knows about.
   *   "__all__"                      → every farm (the default)
   *   "general" / null / "null"      → no farm data, general advice
   *   <farm id>                      → that single field
   * Returns the notice shown in the chat, in the farmer's profile language.
   */
  async setActiveFarm(userId, fieldId, agentOptions = {}) {
    const isAll = fieldId === "__all__";
    const isGeneral =
      !isAll &&
      (!fieldId ||
        fieldId === "general" ||
        String(fieldId).toLowerCase() === "null");
    const key = isAll ? "all" : isGeneral ? "general" : String(fieldId);

    const ctx = await this._prepare(userId, agentOptions);
    if (!ctx.user) return getNotice("profile_fail", "en");

    let farmDocs = [];
    let single = null;
    if (isAll) {
      farmDocs = ctx.allFarms.slice(0, MAX_FARMS_IN_PROMPT);
    } else if (!isGeneral) {
      single = ctx.allFarms.find((f) => f._id.toString() === key) || null;
      if (!single) return getNotice("ctx_fail", ctx.language);
      farmDocs = [single];
    }

    const mode = isGeneral ? "general" : isAll ? "all" : "farm";
    const unchanged =
      userActiveFarmKey.get(userId) === key && userAgents.has(userId);
    let described = farmDocs;
    if (!unchanged) {
      // an "all farms" request from a farmer with no farms is just general mode
      const effectiveMode = isAll && !farmDocs.length ? "general" : mode;
      described = await this._buildAgent(userId, ctx, effectiveMode, farmDocs);
      userActiveFarmKey.set(userId, key);
    }

    if (isGeneral) return getNotice("general_ack", ctx.language);
    if (isAll) {
      const list = described.map((f) => {
        const crop = cropLabelOf(f);
        return crop ? `${f.fieldName} (${crop})` : f.fieldName;
      });
      if (!list.length) return getNotice("general_ack", ctx.language);
      return getNotice("all_farms_ack", ctx.language, { list: list.join(", ") });
    }
    const f = described[0] || single;
    return getNotice("now_discussing", ctx.language, {
      field: f.fieldName,
      crop: cropLabelOf(f),
      acres: formatAcresTwoDecimals(f.acre),
    });
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

  /**
   * Profile (address) changed: rebuild the agent so it sees the new location, keeping the
   * farm the farmer is currently discussing. No-op if they have no live chat session.
   */
  async refreshAfterProfileChange(userId) {
    try {
      if (!userAgents.has(userId)) return;
      const key = userActiveFarmKey.get(userId) || "all";
      userAgents.delete(userId);
      const target = key === "all" ? "__all__" : key;
      await this.setActiveFarm(userId, target, {
        organizationCode: userAgentOrgCodes.get(userId),
      });
    } catch (err) {
      console.error("Agent refresh after profile change failed:", err?.message || err);
      userAgents.delete(userId);
    }
  }

  /** True once (then resets) if the agent saved profile details since the last check. */
  consumeProfileSaved(userId) {
    return profileSavedUsers.delete(String(userId));
  }

  cleanupUser(userId) {
    userAgents.delete(userId);
    userActiveFarmKey.delete(userId);
    userLanguages.delete(String(userId));
  }
}

export default new AppSocketService();
