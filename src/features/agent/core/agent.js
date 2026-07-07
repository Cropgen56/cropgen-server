import { ChatOpenAI } from "@langchain/openai";
import {
  ChatPromptTemplate,
  MessagesPlaceholder,
} from "@langchain/core/prompts";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { ChatMessageHistory } from "langchain/stores/message/in_memory";
import {
  PUBLIC_SYSTEM_PROMPT,
  buildPublicSystemPrompt,
  buildAppSystemPrompt,
  getAgentOrgProfile,
} from "./systemPrompts.js";

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

function extractText(message) {
  const c = message?.content;
  if (typeof c === "string") return c;
  if (Array.isArray(c)) {
    return c
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part === "object" && "text" in part && part.text != null) {
          return String(part.text);
        }
        return "";
      })
      .join("");
  }
  return "";
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
  if (chatHistory.messages.length > MAX_STORED_MESSAGES) {
    chatHistory.messages = chatHistory.messages.slice(-MAX_STORED_MESSAGES);
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

function createOpenAIProvider() {
  const openaiKey = String(process.env.OPENAI_API_KEY ?? "").trim();
  if (!openaiKey) return null;

  const { temperature, maxTokens } = readModelConfig();
  const model =
    process.env.OPENAI_AGENT_MODEL ||
    process.env.OPENAI_MODEL ||
    "gpt-4o-mini";

  return {
    name: "openai",
    chatModel: new ChatOpenAI({
      model,
      temperature,
      maxTokens,
      topP: 0.9,
      maxRetries: 2,
      streaming: false,
      apiKey: openaiKey,
    }),
  };
}

function buildChain(systemPrompt) {
  const provider = createOpenAIProvider();
  if (!provider) return null;

  const prompt = ChatPromptTemplate.fromMessages([
    ["system", systemPrompt],
    new MessagesPlaceholder("history"),
    ["human", "{input}"],
  ]);

  return {
    chain: prompt.pipe(provider.chatModel),
    chatModel: provider.chatModel,
    systemPrompt,
  };
}

async function generateAgentReply({
  chain,
  chatModel,
  systemPrompt,
  incompleteReply,
  text,
  history,
}) {
  let aiMessage = await chain.invoke({ input: text, history });
  let raw = extractText(aiMessage).trim();
  let response = formatPlainFarmerReply(raw);

  if (needsRecoveryReply(response)) {
    const recovery = await chatModel.invoke([
      new SystemMessage(
        `${systemPrompt}\n\nRECOVERY: Your last answer was incomplete or cut off. Write a full reply in English: complete sentences ending with periods, at least 3 sentences. Do not stop mid-phrase.`,
      ),
      new HumanMessage(text),
    ]);
    raw = extractText(recovery).trim();
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
  const built = buildChain(systemPrompt);

  if (!built) {
    return {
      async preloadHistory() {},
      async call() {
        return { response: AI_NOT_CONFIGURED_REPLY };
      },
    };
  }

  const { chain, chatModel, systemPrompt: builtPrompt } = built;
  const chatHistory = new ChatMessageHistory();

  return {
    async preloadHistory(pairs = []) {
      for (const p of pairs) {
        const content = String(p?.content ?? "").trim();
        if (!content) continue;
        if (p.role === "assistant") {
          await chatHistory.addAIMessage(content);
        } else {
          await chatHistory.addUserMessage(content);
        }
      }
      trimStoredHistory(chatHistory);
    },

    async call({ input }) {
      const text = typeof input === "string" ? input.trim() : String(input ?? "");
      if (!text) return { response: "Sorry, I didn't catch that." };

      const prior = await chatHistory.getMessages();
      const history = prior.slice(-MAX_CONTEXT_MESSAGES);

      try {
        const response = await generateAgentReply({
          chain,
          chatModel,
          systemPrompt: builtPrompt,
          incompleteReply,
          text,
          history,
        });

        await chatHistory.addUserMessage(text);
        await chatHistory.addAIMessage(response);
        trimStoredHistory(chatHistory);

        return { response };
      } catch (err) {
        console.error("AI invoke error (openai):", err?.message || err);
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
  return createAgent(buildPublicSystemPrompt(organizationCode));
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
  return createAgent(prompt, { incompleteReply: profile.incompleteReplyText });
}

export function createAgentForUser(organizationCode = "CROPGEN") {
  return createPublicAgentByOrg(organizationCode);
}
