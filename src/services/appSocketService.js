import { createAppAgent } from "../agent/index.js";
import { getAgentOrgProfile } from "../agent/systemPrompts.js";
import User from "../models/user.model.js";
import FarmField from "../models/field.model.js";
import FarmAdvisory from "../features/advisory/models/farmAdvisory.model.js";
import AppUserChat from "../models/AppUserChat.js";
import { formatAcresTwoDecimals } from "../utils/formatAcres.js";

const userAgents = new Map();

const MAX_PERSISTED_MESSAGES = 100;

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

class AppSocketService {
  /**
   * Load user profile + farms, build a personalised agent, return welcome message.
   */
  async initializeUser(userId) {
    const user = await User.findById(userId)
      .populate("organization", "organizationCode")
      .lean();
    const farms = await FarmField.find({ user: userId }).lean();

    const userName =
      [user?.firstName, user?.lastName].filter(Boolean).join(" ") || "Farmer";

    const orgCode = user?.organization?.organizationCode || "CROPGEN";
    const profile = getAgentOrgProfile(orgCode);

    const advisoryByFarmId = await getLatestAdvisoryByFarmId(farms);
    const agent = createAppAgent(userName, farms, {
      advisoryByFarmId,
      organizationCode: orgCode,
    });
    userAgents.set(userId, agent);

    if (farms.length === 0) {
      return `Hi ${userName}! I'm your ${profile.assistantTitle}. You haven't added any farms yet — add one from the dashboard to get personalised crop advice. In the meantime, feel free to ask me anything about farming!`;
    }

    const farmNames = farms.map((f) => f.fieldName).join(", ");
    return `Hi ${userName}! I can see your farm${farms.length > 1 ? "s" : ""}: ${farmNames}. Ask me anything about your crops — pest management, irrigation, growth stage, yield estimates, or advisory insights.`;
  }

  async handleMessage(userId, message) {
    const ai = userAgents.get(userId);
    if (!ai) {
      try {
        await this.initializeUser(userId);
        const ai2 = userAgents.get(userId);
        if (ai2) {
          const todayISO = new Date().toISOString().slice(0, 10);
          const input = `[Current date (server): ${todayISO}]\n\n${message}`;
          const res = await ai2.call({ input });
          return res?.response ?? "Sorry, I didn't understand that.";
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
      return res?.response ?? "Sorry, I didn't understand that.";
    } catch (err) {
      console.error("App AI call error:", err);
      return "AI error occurred. Please try again.";
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

  async resetConversation(userId) {
    userAgents.delete(userId);
    try {
      await this.initializeUser(userId);
    } catch (err) {
      console.error("Reset re-init failed:", err);
    }
  }

  /**
   * Narrow or broaden the AI context to one field (or all farms if fieldId is null/invalid).
   * Call from socket event `set_active_farm` after the client loads farm list.
   */
  async setActiveFarm(userId, fieldId) {
    const user = await User.findById(userId)
      .populate("organization", "organizationCode")
      .lean();
    if (!user) {
      return "Could not load your profile. Please try again.";
    }

    const allFarms = await FarmField.find({ user: userId }).lean();
    const userName =
      [user?.firstName, user?.lastName].filter(Boolean).join(" ") || "Farmer";

    const orgCode = user?.organization?.organizationCode || "CROPGEN";

    let farmsForAgent = allFarms;
    if (fieldId) {
      const sid = String(fieldId);
      const match = allFarms.find((f) => f._id.toString() === sid);
      if (match) {
        farmsForAgent = [match];
      }
    }

    const advisoryByFarmId = await getLatestAdvisoryByFarmId(farmsForAgent);
    const agent = createAppAgent(userName, farmsForAgent, {
      advisoryByFarmId,
      organizationCode: orgCode,
    });
    userAgents.set(userId, agent);

    if (allFarms.length === 0) {
      return `Hi ${userName}! Add a farm from the dashboard for field-specific advice. You can still ask general farming questions.`;
    }

    if (farmsForAgent.length === 1) {
      const f = farmsForAgent[0];
      const acres = formatAcresTwoDecimals(f.acre);
      return `Now discussing ${f.fieldName} (${f.cropName}, ${acres} acre). What would you like to know?`;
    }

    const farmNames = allFarms.map((f) => f.fieldName).join(", ");
    return `Showing all your farms: ${farmNames}. Tap a farm above to focus the chat on one field, or ask a general question.`;
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
  }
}

export default new AppSocketService();
