import {
  Agent,
  OpenAIProvider,
  Runner,
  assistant,
  user,
} from "@openai/agents";
import {
  PUBLIC_SYSTEM_PROMPT,
  buildPublicSystemPrompt,
  buildAppSystemPrompt,
  getAgentOrgProfile,
} from "./systemPrompts.js";
import { cropKnowledgeTool } from "../tools/cropKnowledgeTool.js";

const MAX_STORED_MESSAGES = 24;
const MAX_CONTEXT_MESSAGES = 16;

export const AI_ERROR_REPLY = "AI error occurred. Please try again.";
export const AI_NOT_CONFIGURED_REPLY =
  "AI chat is not configured. Please contact support.";

export function isGenericAgentFailure(text) {
  const t = String(text || "").trim();
  return (
    !t ||
    t === AI_ERROR_REPLY ||
    t === AI_NOT_CONFIGURED_REPLY ||
    /^AI error occurred/i.test(t)
  );
}

const DEFAULT_INCOMPLETE_REPLY =
  "I could not generate a full answer just now. Please ask again, or visit cropgenapp.com for product details.";

function isIncompleteReply(s) {
  const t = (s || "").trim();
  if (!t) return true;
  if (/^(Do|Check|Avoid|Next):\s*$/i.test(t)) return true;
  const lines = t.split(/\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 1 && /^(Do|Check|Avoid|Next):\s*$/i.test(lines[0])) return true;
  return false;
}

function looksTruncated(s) {
  const t = (s || "").trim();
  if (!t) return true;
  if (/[.!?…]["']?\s*$/.test(t)) return false;
  if (t.length < 22) return true;
  if (t.length >= 220) return false;
  return /\b(make|makes|making|helps?|better|more|less|the|a|an|to|for|and|or|with|is|are|was|were|be|been|being|have|has|had|your|our|their|that|this|what|when|how|which|if|as|so|like|such|CropGen\s+helps|Bio\s+Drops\s+helps|Satagro\s+helps)\s*$/i.test(t);
}

function needsRecoveryReply(s) {
  return isIncompleteReply(s) || looksTruncated(s);
}

function isAccessDisclaimer(s) {
  const t = String(s || "");
  return /don'?t have (direct |real-?time )?(access|weather)|do not have (direct |real-?time )?(access|weather)|cannot access (real-?time )?(weather|data)|no (direct |real-?time )?(access to )?(weather|data)|unable to (access|see|get) (your )?(weather|live data)/i.test(
    t,
  );
}

function formatPlainFarmerReply(raw) {
  if (!raw) return "";
  let s = raw.replace(/\r\n/g, "\n");
  for (let i = 0; i < 6; i++) {
    const next = s.replace(/\*\*([^*]+)\*\*/g, "$1");
    if (next === s) break;
    s = next;
  }
  s = s.replace(/\*\*/g, "");
  s = s.replace(/:\s*\*\s+/g, ":\n• ");
  s = s.replace(/^\s*\*\s+/gm, "• ");
  s = s.replace(/([.!?])\s*\*\s+/g, "$1\n• ");
  s = normalizeListLineBreaks(s);
  s = s.replace(/\n{3,}/g, "\n\n");
  return s.trim();
}

function normalizeListLineBreaks(s) {
  let t = s.replace(/\r\n/g, "\n");
  t = t.replace(/([.!?])\s*(Do|Check|Avoid|Next):\s*•\s+/gi, "$1\n\n$2:\n• ");
  t = t.replace(/(^|\n)(Do|Check|Avoid|Next):\s*•\s+/gm, "$1$2:\n• ");
  t = t.replace(/([.!?])\s*•\s+/g, "$1\n• ");
  t = t.replace(/([.!?])\s*(Do|Check|Avoid|Next):\s+(?!•\s)/gi, "$1\n\n$2:\n");
  return t.replace(/\n{3,}/g, "\n\n");
}

function trimStoredHistory(chatHistory) {
  if (chatHistory.length > MAX_STORED_MESSAGES) {
    chatHistory.splice(0, chatHistory.length - MAX_STORED_MESSAGES);
  }
}

function readModelConfig() {
  const envTemp =
    process.env.OPENAI_AGENT_TEMPERATURE ?? process.env.OPENAI_TEMPERATURE;
  const envMaxOut =
    process.env.OPENAI_AGENT_MAX_TOKENS ?? process.env.OPENAI_MAX_TOKENS;

  return {
    temperature:
      envTemp !== undefined && envTemp !== "" ? Number(envTemp) : 0.42,
    maxTokens:
      envMaxOut !== undefined && envMaxOut !== "" ? Number(envMaxOut) : 1024,
  };
}

const AGENT_TIMEOUT_MS = 45000;
/** Model call + up to a couple of tool round-trips. */
const AGENT_MAX_TURNS = 4;

const TOOL_GUIDANCE = `

CROP ENCYCLOPEDIA TOOL:
• For any question about a specific crop's pests, diseases, symptoms, control/spray options, varieties, sowing, seed rate, fertilizer, irrigation, weeds or harvest, call get_crop_knowledge first and base your answer on its data.
• Prefer the tool's product names and doses over your own memory. Respect the farm's Farming type (organic vs chemical) when choosing which control options to give.
• If the tool says the crop is not found, answer from general agronomy without mentioning the tool.
• Never mention the tool, JSON or "database" to the farmer.`;

let runner = null;

/** One shared Runner backed by the OpenAI Agents SDK provider. */
function getRunner() {
  const openaiKey = String(process.env.OPENAI_API_KEY ?? "").trim();
  if (!openaiKey) return null;
  if (!runner) {
    runner = new Runner({
      modelProvider: new OpenAIProvider({ apiKey: openaiKey }),
      workflowName: "CropGen farm assistant",
    });
  }
  return runner;
}

function resolveModelName() {
  return (
    process.env.OPENAI_AGENT_MODEL ||
    process.env.OPENAI_MODEL ||
    "gpt-4o-mini"
  );
}

function buildAgent(name, instructions) {
  const { temperature, maxTokens } = readModelConfig();
  return new Agent({
    name,
    instructions: `${instructions}${TOOL_GUIDANCE}`,
    model: resolveModelName(),
    tools: [cropKnowledgeTool],
    modelSettings: { temperature, maxTokens, topP: 0.9 },
  });
}

function toInputItems(history, text) {
  return [
    ...history.map((m) =>
      m.role === "assistant" ? assistant(m.content) : user(m.content),
    ),
    user(text),
  ];
}

async function runAgent(agentRunner, agent, input) {
  const result = await agentRunner.run(agent, input, {
    maxTurns: AGENT_MAX_TURNS,
    signal: AbortSignal.timeout(AGENT_TIMEOUT_MS),
  });
  const out = result.finalOutput;
  return typeof out === "string" ? out.trim() : "";
}

async function generateAgentReply({
  agentRunner,
  agent,
  incompleteReply,
  text,
  history,
}) {
  let raw = await runAgent(agentRunner, agent, toInputItems(history, text));
  let response = formatPlainFarmerReply(raw);

  if (needsRecoveryReply(response) || isAccessDisclaimer(response)) {
    const recoveryAgent = agent.clone({
      instructions: `${agent.instructions}\n\nRECOVERY: ${
        isAccessDisclaimer(response)
          ? "Your last answer claimed you lack weather or data access. That is forbidden. Use the farm weather snapshot, location, crop, NPK, yield, and advisory in the system prompt. Answer with concrete field actions. Never say you don't have access."
          : "Your last answer was incomplete or cut off. Write a full reply in English: complete sentences ending with periods, at least 3 sentences. Do not stop mid-phrase."
      }`,
    });
    raw = await runAgent(agentRunner, recoveryAgent, [user(text)]);
    response = formatPlainFarmerReply(raw);
  }

  if (needsRecoveryReply(response)) {
    response = incompleteReply;
  } else if (!response) {
    response = "Sorry, I didn't understand that.";
  }

  return response;
}

function createAgent(systemPrompt, agentOptions = {}) {
  const incompleteReply =
    agentOptions.incompleteReply || DEFAULT_INCOMPLETE_REPLY;
  const agentRunner = getRunner();

  if (!agentRunner) {
    return {
      async preloadHistory() {},
      async call() {
        return { response: AI_NOT_CONFIGURED_REPLY };
      },
    };
  }

  const agent = buildAgent(
    agentOptions.agentName || "CropGen AI",
    systemPrompt,
  );

  /** @type {{ role: "user" | "assistant", content: string }[]} */
  const chatHistory = [];

  return {
    async preloadHistory(pairs = []) {
      for (const p of pairs) {
        const content = String(p?.content ?? "").trim();
        if (!content) continue;
        chatHistory.push({
          role: p.role === "assistant" ? "assistant" : "user",
          content,
        });
      }
      trimStoredHistory(chatHistory);
    },

    async call({ input }) {
      const text = typeof input === "string" ? input.trim() : String(input ?? "");
      if (!text) return { response: "Sorry, I didn't catch that." };

      const history = chatHistory.slice(-MAX_CONTEXT_MESSAGES);

      try {
        const response = await generateAgentReply({
          agentRunner,
          agent,
          incompleteReply,
          text,
          history,
        });

        chatHistory.push({ role: "user", content: text });
        chatHistory.push({ role: "assistant", content: response });
        trimStoredHistory(chatHistory);

        return { response };
      } catch (err) {
        const cause =
          err?.cause?.code ||
          err?.cause?.message ||
          err?.code ||
          err?.status ||
          "";
        console.error(
          "AI invoke error (openai-agents):",
          err?.message || err,
          cause ? `[${cause}]` : "",
        );
        return { response: AI_ERROR_REPLY };
      }
    },
  };
}

/**
 * Create a public agent (for unauthenticated website visitors).
 */
export function createPublicAgent() {
  return createAgent(PUBLIC_SYSTEM_PROMPT);
}

export function createPublicAgentByOrg(organizationCode = "CROPGEN") {
  return createAgent(buildPublicSystemPrompt(organizationCode), {
    agentName: getAgentOrgProfile(organizationCode).assistantName,
  });
}

/**
 * Create an app agent (for logged-in users with farm context).
 * @param {object} [agentOptions] — e.g. { advisoryByFarmId: Record<string, object> }
 */
export function createAppAgent(userName, farms, agentOptions = {}) {
  const profile = getAgentOrgProfile(agentOptions.organizationCode);
  const prompt = buildAppSystemPrompt(userName, farms, {
    ...agentOptions,
    agentProfile: profile,
  });
  return createAgent(prompt, {
    agentName: profile.assistantName,
    incompleteReply: profile.incompleteReplyText,
  });
}

export function createAgentForUser(organizationCode = "CROPGEN") {
  return createPublicAgentByOrg(organizationCode);
}
