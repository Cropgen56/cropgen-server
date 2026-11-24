import crypto from "node:crypto";
import mongoose from "mongoose";
import NoticeTranslation from "../../../models/notice-translation.model.js";
import {
  getFarmerLanguagePromptDescriptor,
  normalizeFarmerLanguage,
} from "../../../utils/language/farmerLanguages.js";
import { translateStrings } from "../core/translate.js";

/** Messages the SERVER writes (not the AI model). English is the source of truth. */
export const NOTICES = {
  welcome_farms:
    "Hi {name}! I'm your {title}. Ask me anything about farming, or pick a farm above for field-specific advice.",
  welcome_nofarm:
    "Hi {name}! I'm your {title}. Ask me anything about farming, or add a farm from the dashboard for field-specific advice.",
  welcome_fallback: "Welcome! How can I help with your farm today?",
  all_farms_ack:
    "Showing all your farms: {list}. Ask me about any of them, or pick one above.",
  now_discussing:
    "Now discussing {field} ({crop}, {acres} acre). What would you like to know?",
  general_ack:
    "General farming mode. Ask about practices, crops, pests, irrigation, soil, or weather in your region — not tied to a specific field.",
  reset:
    "Conversation reset. Ask a farming question, or tap a farm for field-specific advice.",
  ai_down:
    "I'm having trouble reaching the AI service right now. Please try again in a moment.",
  session_expired: "Session expired. Please refresh the page.",
  ctx_fail: "Could not switch farm context. Please try again.",
  profile_fail: "Could not load your profile. Please try again.",
  verify_label:
    "Please confirm this amount on the product label and with your local KVK or agriculture officer before using it.",
  sources_label: "Sources",
  no_dose:
    "I can't give an exact amount for this without a reviewed local source. Please follow the product label and confirm the dose with your local KVK or state agricultural university. If you tell me the crop, growth stage and what you see in the field, I can help with the rest.",
};

const placeholders = (s) => (String(s).match(/\{\w+\}/g) || []).sort().join(",");

/** A translation is only trusted if it kept every {placeholder}. */
export function validTranslation(english, translated) {
  return (
    typeof translated === "string" &&
    translated.trim().length > 0 &&
    placeholders(english) === placeholders(translated)
  );
}

export function fillTemplate(template, vars = {}) {
  return String(template).replace(/\{(\w+)\}/g, (m, k) =>
    vars[k] != null ? String(vars[k]) : m,
  );
}

const SOURCE_HASH = crypto.createHash("sha1").update(JSON.stringify(NOTICES)).digest("hex");
const DB_READY = () => mongoose.connection.readyState === 1;
/** Max time a farmer waits for a translation before getting English for that one message. */
const MAX_WAIT_MS = 4000;

/** language code -> Promise<{ key: text }> (translated once, then kept in memory + database). */
const cache = new Map();

async function loadOrTranslate(lang) {
  if (DB_READY()) {
    try {
      const saved = await NoticeTranslation.findOne({ language: lang, sourceHash: SOURCE_HASH }).lean();
      if (saved?.strings) return { ...NOTICES, ...saved.strings };
    } catch {
      /* fall through to translating */
    }
  }
  const t = await translateStrings(NOTICES, getFarmerLanguagePromptDescriptor(lang));
  if (!t) return null;
  const out = {};
  for (const [k, en] of Object.entries(NOTICES)) {
    out[k] = validTranslation(en, t[k]) ? t[k] : en;
  }
  if (DB_READY()) {
    NoticeTranslation.updateOne(
      { language: lang },
      { $set: { sourceHash: SOURCE_HASH, strings: out } },
      { upsert: true },
    ).catch(() => {});
  }
  return out;
}

function translationsFor(lang) {
  if (!cache.has(lang)) {
    const p = loadOrTranslate(lang)
      .then((out) => {
        if (!out) cache.delete(lang); // failed — try again next time
        return out || { ...NOTICES };
      })
      .catch(() => {
        cache.delete(lang);
        return { ...NOTICES };
      });
    cache.set(lang, p);
  }
  return cache.get(lang);
}

/** Pre-translate in the background (no waiting, errors ignored). */
export function warmNoticeLanguages(codes = ["hi", "mr"]) {
  for (const c of codes) {
    const lang = normalizeFarmerLanguage(c);
    if (lang !== "en") translationsFor(lang);
  }
}

/**
 * Server message in the farmer's profile language. Falls back to English if the translation is
 * unavailable or slow (it keeps translating in the background for next time) — never throws.
 */
export async function getNotice(key, languageCode, vars = {}) {
  const lang = normalizeFarmerLanguage(languageCode);
  let text = NOTICES[key] ?? key;
  if (lang !== "en") {
    try {
      const translated = await Promise.race([
        translationsFor(lang),
        new Promise((resolve) => setTimeout(() => resolve(null), MAX_WAIT_MS)),
      ]);
      if (translated?.[key]) text = translated[key];
    } catch {
      /* English fallback */
    }
  }
  return fillTemplate(text, vars);
}
