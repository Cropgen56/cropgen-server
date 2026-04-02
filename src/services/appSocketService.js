import { createAppAgent } from "../agent/index.js";
import User from "../models/user.model.js";
import FarmField from "../models/field.model.js";
import AppUserChat from "../models/AppUserChat.js";

const userAgents = new Map();

const MAX_PERSISTED_MESSAGES = 100;

class AppSocketService {
  /**
   * Load user profile + farms, build a personalised agent, return welcome message.
   */
  async initializeUser(userId) {
    const user = await User.findById(userId).lean();
    const farms = await FarmField.find({ user: userId }).lean();

    const userName =
      [user?.firstName, user?.lastName].filter(Boolean).join(" ") || "Farmer";

    const agent = createAppAgent(userName, farms);
    userAgents.set(userId, agent);

    if (farms.length === 0) {
      return `Hi ${userName}! I'm your CropGen AI assistant. You haven't added any farms yet — add one from the dashboard to get personalised crop advice. In the meantime, feel free to ask me anything about farming!`;
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
          const res = await ai2.call({ input: message });
          return res?.response ?? "Sorry, I didn't understand that.";
        }
      } catch (err) {
        console.error("Re-init failed:", err);
      }
      return "Session expired. Please refresh the page.";
    }
    try {
      const res = await ai.call({ input: message });
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
