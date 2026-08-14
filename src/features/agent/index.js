/** AI agent feature — LangChain/OpenAI, sockets, WhatsApp auto-reply */

export {
  createPublicAgent,
  createPublicAgentByOrg,
  createAppAgent,
  createAgentForUser,
} from "./core/agent.js";

export {
  getAgentOrgProfile,
  buildPublicSystemPrompt,
  buildAppSystemPrompt,
} from "./core/systemPrompts.js";

export {
  getCropTimelineStatus,
  describeTimelineForPrompt,
  describeFarmerLocationForPrompt,
  summarizeAdvisoryForPrompt,
  summarizeWeatherForPrompt,
} from "./utils/farmContext.js";

export { setupSocket } from "./socket/setupSocket.js";

export {
  logWhatsAppAgentStatus,
  generateWhatsAppAgentReply,
  clearWhatsAppAgentCache,
  isWhatsAppAgentEnabled,
} from "./services/whatsappAgent.service.js";

export {
  getGlobalReplyMode,
  isAutomationActive,
  getWhatsAppAgentSettingsPayload,
  setGlobalReplyMode,
  invalidateWhatsAppSettingsCache,
} from "./services/whatsappSettings.service.js";

export { default as appSocketService } from "./services/appSocket.service.js";
export { default as publicSocketService } from "./services/publicSocket.service.js";
