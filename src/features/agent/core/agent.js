import {
  Agent,
  assistant,
  user,
} from "@openai/agents";
import {
  PUBLIC_SYSTEM_PROMPT,
  buildPublicSystemPrompt,
  buildAppSystemPrompt,
  getAgentOrgProfile,
} from "./systemPrompts.js";
import { getRunner, resolveModelName } from "./runner.js";
import { getFarmerLanguagePromptDescriptor, normalizeFarmerLanguage } from "../../../utils/language/farmerLanguages.js";
import { getNotice } from "../utils/noticeText.js";
import { translateReply } from "./translate.js";
import {
  buildWebSearchTools,
  citedSources,
  createSearchBudget,
  formatWebCitations,
  hasCitations,
  hasOfficialSource,
  looksLikeDoseQuestion,
} from "./webSearch.js";
import { replyInProfileScript } from "../utils/languageScript.js";
import { mentionsIndianState } from "../utils/farmerContext.js";
import { cropKnowledgeTool } from "../tools/cropKnowledgeTool.js";
import { knowledgeRecordTool } from "../tools/knowledgeRecordTool.js";
import { createSaveProfileTool } from "../tools/profileTool.js";
import { buildSourcedNote } from "../utils/sourcedContext.js";
import { analyzeTurn, extractToolEvents, hasUnsourcedDose, logTurn } from "../utils/turnAudit.js";

// Remember more of the conversation (a general assistant needs the thread, not just the last turns).
const MAX_STORED_MESSAGES = 40;
const MAX_CONTEXT_MESSAGES = 24;

/** Daily per-farmer cap on turns that use web search. */
const searchBudget = createSearchBudget();

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

const NO_DOSE_REPLY =
  "I can't give an exact amount for this without a reviewed local source. Please follow the product label and confirm the dose with your local KVK or state agricultural university. If you tell me the crop, growth stage and what you see in the field, I can help with the rest.";

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
      envMaxOut !== undefined && envMaxOut !== "" ? Number(envMaxOut) : 2048,
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
• Never mention the tool, JSON or "database" to the farmer.

SOURCED GUIDANCE TOOL (get_sourced_guidance):
• For ANY crop-specific question about planting, varieties, nutrients, irrigation, weeds, pests, diseases, harvest, post-harvest, soil or weather risk, call get_sourced_guidance FIRST (pass state and district from "Farmer location" or from what the farmer said; pass the crop stage when known), THEN get_crop_knowledge for anything it did not cover. Do this even when no number is involved.
• If it returns records, build the answer on them: use their numbers with unit and basis, respect conditions/contraindications/requiredInputs, and in the Confidence line name publisher + year (and say the guidance is regional if the record says so). Records win over get_crop_knowledge when they disagree.
• If it returns found:false, do NOT give a number; give the principle or stage window and say the local KVK / state agricultural university package of practices should confirm the rate. get_crop_knowledge data is general reference, not a validated regional rate.
• Never mention the tool or database to the farmer.`;

const BASE_TOOLS = [cropKnowledgeTool, knowledgeRecordTool];

function buildAgent(name, instructions, extraTools = []) {
  const { temperature, maxTokens } = readModelConfig();
  return new Agent({
    name,
    instructions: `${instructions}${TOOL_GUIDANCE}`,
    model: resolveModelName(),
    tools: [...BASE_TOOLS, ...extraTools],
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

async function runAgent(agentRunner, agent, input, audit) {
  const result = await agentRunner.run(agent, input, {
    maxTurns: AGENT_MAX_TURNS,
    signal: AbortSignal.timeout(AGENT_TIMEOUT_MS),
  });
  if (audit) {
    audit.toolEvents.push(...extractToolEvents(result.newItems));
    audit.tokens += result.state?.usage?.totalTokens || 0;
  }
  const out = result.finalOutput;
  return typeof out === "string" ? out.trim() : "";
}

async function generateAgentReply({
  agentRunner,
  agent,
  incompleteReply,
  text,
  history,
  audit,
  language,
  needsLocationConfirm,
}) {
  let raw = await runAgent(agentRunner, agent, toInputItems(history, text), audit);
  let response = formatPlainFarmerReply(raw);

  if (needsRecoveryReply(response) || isAccessDisclaimer(response)) {
    const recoveryAgent = agent.clone({
      instructions: `${agent.instructions}\n\nRECOVERY: ${
        isAccessDisclaimer(response)
          ? "Your last answer claimed you lack weather or data access. That is forbidden. Use the farm weather snapshot, location, crop, NPK, yield, and advisory in the system prompt. Answer with concrete field actions. Never say you don't have access."
          : "Your last answer was incomplete or cut off. Write a full reply in English: complete sentences ending with periods, at least 3 sentences. Do not stop mid-phrase."
      }`,
    });
    if (audit) audit.usedRecovery = true;
    raw = await runAgent(agentRunner, recoveryAgent, [user(text)], audit);
    response = formatPlainFarmerReply(raw);
  }

  // HARD GUARD: the reply must be in the farmer's PROFILE language, not the language they typed.
  if (audit && language && !replyInProfileScript(response, language)) {
    audit.languageGuard = true;
    const desc = getFarmerLanguagePromptDescriptor(normalizeFarmerLanguage(language));
    const langAgent = agent.clone({
      instructions: `${agent.instructions}\n\nLANGUAGE GUARD: Your draft was not in ${desc}. Rewrite the ENTIRE answer in ${desc} only. Do not mirror the language of the farmer's message.`,
    });
    raw = await runAgent(agentRunner, langAgent, toInputItems(history, text), audit);
    response = formatPlainFarmerReply(raw);
    if (!replyInProfileScript(response, language)) {
      // Last resort: translate the reply itself — reliable, and keeps the content.
      const translated = await translateReply(response, desc);
      if (translated) response = formatPlainFarmerReply(translated);
    }
  }

  // HARD GUARD: the farmer named a place and their profile has none — the reply must end by
  // asking to confirm saving it (never saved without a "yes").
  if (audit && needsLocationConfirm && !/[?？]\s*$/.test(response.trim())) {
    audit.locationGuard = true;
    const confirmAgent = agent.clone({
      instructions: `${agent.instructions}\n\nCONFIRM GUARD: The farmer just told you where their farm is, and it is not saved on their profile. Answer their question briefly, then END the reply with exactly one short question asking them to confirm, using the exact place they named, e.g. "I'll save <place> to your profile — correct?" (write it in the reply language). Do not save anything yet.`,
    });
    raw = await runAgent(agentRunner, confirmAgent, toInputItems(history, text), audit);
    response = formatPlainFarmerReply(raw);
  }

  // Amounts found by web search are accepted only when a cited source is OFFICIAL
  // (government / ICAR / university); the farmer is told to verify them on the product label.
  const webUsed = Boolean(audit?.toolEvents.some((e) => e.name === "web_search"));
  const webBacked = webUsed && hasOfficialSource(citedSources(response));
  let verifyLine = "";
  if (audit && webBacked && hasUnsourcedDose(response, audit.toolEvents)) {
    audit.webSourcedDose = true;
    verifyLine = await getNotice("verify_label", language);
  }

  // HARD GUARD: no chemical/fertilizer amount without a reviewed record or an official web source.
  if (audit && !webBacked && hasUnsourcedDose(response, audit.toolEvents)) {
    audit.doseGuard = true;
    const guardAgent = agent.clone({
      instructions: `${agent.instructions}\n\nGUARD: Your draft contained a dose or rate (grams, ml, kg per litre/acre/hectare) that has NO reviewed source. Rewrite the whole answer with NO amounts, doses or rates at all. Explain the principle, say to follow the product label and confirm the amount with the local KVK / state agricultural university, and ask the questions that would help.${webUsed ? " Tell the farmer you searched the web but could not confirm this amount from an official source (ICAR, a state agricultural university, KVK or a government site)." : ""}`,
    });
    raw = await runAgent(agentRunner, guardAgent, toInputItems(history, text), audit);
    response = formatPlainFarmerReply(raw);
    if (hasUnsourcedDose(response, audit.toolEvents)) {
      response = await getNotice("no_dose", language);
    }
  }

  if (needsRecoveryReply(response)) {
    if (audit) audit.isFallback = true;
    response = incompleteReply;
  } else if (!response) {
    response = "Sorry, I didn't understand that.";
  }

  // The chat shows plain text: turn markdown links into [1] references + a Sources list.
  if (webUsed && hasCitations(response)) {
    if (verifyLine) response = `${response}\n\n${verifyLine}`;
    const formatted = formatWebCitations(response, await getNotice("sources_label", language));
    response = formatted.text;
    audit.webSources = formatted.sources.length;
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

  let locationMissing = Boolean(agentOptions.profileMissing?.length);
  // Web search is for logged-in farmers (app / WhatsApp), not the anonymous public website.
  const webTools =
    agentOptions.webSearch && agentOptions.userId
      ? buildWebSearchTools({ farmerUser: agentOptions.farmerUser })
      : [];
  const agent = buildAgent(
    agentOptions.agentName || "CropGen AI",
    systemPrompt,
    [
      ...webTools,
      ...(agentOptions.userId
      ? [
          createSaveProfileTool(agentOptions.userId, {
            onSaved: (saved) => {
              locationMissing = false;
              agentOptions.onProfileSaved?.(saved);
              // The system prompt still says "missing" — tell the model it is now saved.
              const parts = Object.entries(saved).map(([k, v]) => `${k}=${v}`).join(", ");
              agent.instructions += `\n\nUPDATE (this conversation): the farmer's location was just saved to their profile (${parts}). It is no longer missing — do not ask for it again; use it for local advice and for get_sourced_guidance.`;
            },
          }),
        ]
      : []),
    ],
  );
  const searchKey = String(agentOptions.userId || "anon");
  // The farmer's PROFILE language wins over the language they happen to type in.
  const languageHint = () => {
    if (!agentOptions.language) return "";
    const lang = normalizeFarmerLanguage(agentOptions.language);
    return `\n\n[Reply language: ${getFarmerLanguagePromptDescriptor(lang)} (code ${lang}). Write your ENTIRE reply in this language. Do NOT mirror the language of the farmer's message — their saved profile language decides — unless they explicitly ask you to switch.]`;
  };
  const turnHint = () =>
    languageHint() +
    (locationMissing
      ? `\n\n[System note: the farmer's ${agentOptions.profileMissing.join(" and ")} is not on their profile. ONLY if this message actually states a state or district, answer the question and END your reply with: "I'll save <state, district> to your profile — correct?" using the exact place they named. If it does not state a location, do not mention saving at all. Never call save_profile_details until they confirm.]`
      : "");

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
      const audit = { toolEvents: [], tokens: 0, usedRecovery: false, isFallback: false };
      const startedAt = Date.now();
      const writeLog = (reply, error) => {
        const { flags, askedQuestions } = analyzeTurn({
          reply,
          toolEvents: audit.toolEvents,
          farmerContext: agentOptions.farmerContext,
          usedRecovery: audit.usedRecovery,
          isFallback: audit.isFallback || Boolean(error),
          doseGuard: audit.doseGuard,
          webSourcedDose: audit.webSourcedDose,
        });
        logTurn({
          user: agentOptions.userId || null,
          channel: agentOptions.channel || (agentOptions.userId ? "app" : "public"),
          organizationCode: agentOptions.organizationCode,
          farmerState: agentOptions.farmerContext?.farmerState,
          profileMissing: agentOptions.farmerContext?.profileMissing,
          farmMissing: agentOptions.farmerContext?.farmMissing,
          userMessage: text,
          reply,
          tools: audit.toolEvents,
          flags,
          askedQuestions,
          usedRecovery: audit.usedRecovery,
          model: resolveModelName(),
          latencyMs: Date.now() - startedAt,
          totalTokens: audit.tokens,
          error: error ? String(error.message || error) : undefined,
        });
      };

      // Over the daily search cap → same agent without the web tool for this turn.
      const webOk = webTools.length > 0 && searchBudget.allowed(searchKey);
      const turnAgent = webOk
        ? agent
        : webTools.length
          ? agent.clone({ tools: [...BASE_TOOLS, ...agent.tools.filter((t) => t.name === "save_profile_details")] })
          : agent;
      const searchPolicy =
        webOk && looksLikeDoseQuestion(text)
          ? "\n\n[Web search policy for this turn: this is about a chemical or fertiliser amount. If you search, look ONLY for official sources — ICAR, a state agricultural university, KVK, CIB&RC or a government site (put words like ICAR / KVK / agricultural university in the query) — and cite only those. Never use shops, blogs or videos for amounts.]"
          : "";

      try {
        const sourced = await buildSourcedNote({
          text,
          state: agentOptions.farmerUser?.state,
          district: agentOptions.farmerUser?.district,
          cropNames: agentOptions.cropNames,
        });
        if (sourced.recordIds.length) {
          audit.toolEvents.push({ name: "get_sourced_guidance", args: "prefetch", found: true, recordIds: sourced.recordIds, numbers: sourced.numbers });
        }
        const response = await generateAgentReply({
          agentRunner,
          agent: turnAgent,
          incompleteReply,
          text: `${text}${turnHint()}${searchPolicy}${sourced.note}`,
          history,
          audit,
          language: agentOptions.language,
          needsLocationConfirm: locationMissing && mentionsIndianState(text),
        });
        if (audit.toolEvents.some((e) => e.name === "web_search")) searchBudget.record(searchKey);
        writeLog(response);

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
        writeLog(AI_ERROR_REPLY, err);
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
    userId: agentOptions.userId,
    webSearch: true,
    language: agentOptions.language,
    profileMissing: agentOptions.farmerContext?.profileMissing,
    farmerContext: agentOptions.farmerContext,
    onProfileSaved: agentOptions.onProfileSaved,
    farmerUser: agentOptions.farmerUser,
    cropNames: (farms || []).flatMap((f) =>
      Array.isArray(f.crops) && f.crops.length ? f.crops.map((c) => c.cropName) : [f.cropName],
    ).filter(Boolean),
    channel: agentOptions.channel,
    organizationCode: profile.organizationCode,
  });
}

export function createAgentForUser(organizationCode = "CROPGEN") {
  return createPublicAgentByOrg(organizationCode);
}
