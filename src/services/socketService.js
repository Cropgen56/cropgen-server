import { createAgentForUser } from "../agent/index.js";
import { getAgentOrgProfile } from "../agent/systemPrompts.js";
import { validateOrganization } from "../validations/organizationValidation.js";
import { validateFarmer } from "../validations/farmerValidation.js";
import farmerService from "./farmerService.js";
import organizationService from "./organizationService.js";
import chatService from "./chatService.js";
import pkg from "google-libphonenumber";

const { PhoneNumberUtil } = pkg;
const phoneUtil = PhoneNumberUtil.getInstance();

const userAgents = new Map();
const userStates = new Map();
const userHistories = new Map();

const organizationQuestions = [
  "What is the name of your organization?",
  "What is the contact number of your organization?",
  "What is the email address of your organization?",
];

const farmerQuestions = [
  "What is your name?",
  "What is your contact number?",
];

class SocketService {
  createEmptyState() {
    return {
      type: null,
      step: 0,
      data: {},
      questions: [],
      history: [],
      userObject: null,
      userType: null,
      organizationCode: "CROPGEN",
      agentProfile: getAgentOrgProfile("CROPGEN"),
    };
  }

  initializeUser(userId, organizationCode = "CROPGEN") {
    const state = this.createEmptyState();
    state.organizationCode = organizationCode;
    state.agentProfile = getAgentOrgProfile(organizationCode);
    userStates.set(userId, state);
    userAgents.set(userId, createAgentForUser(organizationCode));
    userHistories.set(userId, []);
  }

  getUserState(userId) {
    return userStates.get(userId) || this.createEmptyState();
  }

  setUserState(userId, state) {
    userStates.set(userId, state);
  }

  getUserAgent(userId) {
    return userAgents.get(userId);
  }

  async recordMessage(userId, sender, text) {
    const state = userStates.get(userId);
    if (!state) return null;

    const msgObj = { sender, text, ts: new Date() };
    state.history.push(msgObj);

    try {
      if (state.userObject && state.userType) {
        const chat = await chatService.addMessage(
          state.userObject._id,
          state.userType,
          msgObj
        );
        return chat;
      }
    } catch (err) {
      console.error("Failed to save chat:", err);
    }
    return null;
  }

  handleRoleSelection(cleanedMsg, state) {
    let reply;
    switch (cleanedMsg) {
      case "1":
        state.type = "organization";
        state.userType = "Organization";
        state.questions = organizationQuestions;
        reply = state.questions[0];
        break;
      case "2":
        state.type = "farmer";
        state.userType = "Farmer";
        state.questions = farmerQuestions;
        reply = state.questions[0];
        break;
      case "3":
        state.type = "general";
        {
          const appName = state.agentProfile?.dashboardApp || "CropGen";
          const appNameLower = appName.toLowerCase();
          reply = `${appName} is a satellite-based crop monitoring platform that helps farmers and organizations optimize agricultural outcomes. How can I assist you further?`;
          if (appNameLower === "satagro") {
            reply =
              "Satagro is a satellite-based crop monitoring platform that helps farmers and organizations optimize agricultural outcomes. How can I assist you further?";
          }
        }
        break;
      default:
        reply = "Invalid choice. Please reply with 1, 2, or 3.";
    }
    return { reply, state };
  }

  validateField(field, value) {
    let errorMsg = null;

    if (field === "name") {
      if (value.length < 3) {
        errorMsg = "Please enter a valid name with at least 3 characters.";
      }
    } else if (field === "contact") {
      try {
        const number = phoneUtil.parse(value);
        if (!phoneUtil.isValidNumber(number)) {
          errorMsg = "Please enter a valid phone number with country code.";
        }
      } catch (err) {
        errorMsg = "Invalid phone number format. Please include country code.";
      }
    } else if (field === "email") {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(value)) {
        errorMsg = "Please enter a valid email address.";
      }
    }

    return errorMsg;
  }

  getFieldsForType(type) {
    return type === "organization"
      ? ["name", "contact", "email"]
      : ["name", "contact"];
  }

  validateUserData(type, data) {
    return type === "organization"
      ? validateOrganization(data)
      : validateFarmer(data);
  }

  async saveUser(type, data) {
    if (type === "organization") {
      return await organizationService.createOrganization(data);
    } else {
      return await farmerService.createFarmer(data);
    }
  }

  async handleAIConversation(userId, message) {
    const ai = userAgents.get(userId);
    if (!ai) return "Session expired. Please refresh the page.";
    try {
      const res = await ai.call({ input: message });
      return res?.response ?? "Sorry, I didn't understand that.";
    } catch (err) {
      console.error("AI call error:", err);
      return "AI error occurred.";
    }
  }

  resetConversation(userId) {
    const state = userStates.get(userId);
    if (state && state.history.length > 0) {
      const histories = userHistories.get(userId) || [];
      histories.push(state.history);
      userHistories.set(userId, histories);
    }
    const orgCode = state?.organizationCode || "CROPGEN";
    this.initializeUser(userId, orgCode);
  }

  async getChatHistory(userId) {
    const state = userStates.get(userId);
    let chatHistory = [];

    try {
      if (state?.userObject) {
        const chat = await chatService.getChatHistoryByUserId(state.userObject._id);
        if (chat) chatHistory = chat.messages;
      }
    } catch (err) {
      console.error("Error fetching chat history:", err);
    }

    return chatHistory;
  }

  cleanupUser(userId) {
    userAgents.delete(userId);
    userStates.delete(userId);
    userHistories.delete(userId);
  }
}

export default new SocketService();
