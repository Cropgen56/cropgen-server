/**
 * Farmer-facing advisory strings for all supported languages.
 * Add `<code>.json` under `messages/` (same keys as en.json). Missing keys fall back to English.
 */

import {
  normalizeAdvisoryLanguage,
  isAdvisoryLanguageSupported,
} from "./advisoryLanguages.js";
import { getMessageBundle } from "./messages/index.js";

export { normalizeAdvisoryLanguage, isAdvisoryLanguageSupported };

/** Major Indic scripts used in supported languages */
const INDIC_SCRIPT =
  /[\u0900-\u097F\u0980-\u09FF\u0A00-\u0A7F\u0A80-\u0AFF\u0B00-\u0B7F\u0B80-\u0BFF\u0C00-\u0C7F\u0C80-\u0CFF\u0D00-\u0D7F]/;

/** Arabic script (Urdu, Sindhi, Kashmiri) */
const ARABIC_SCRIPT = /[\u0600-\u06FF]/;

export function t(key, lang, vars = {}) {
  const code = normalizeAdvisoryLanguage(lang);
  const bundle = getMessageBundle(code);
  let text = bundle[key] ?? getMessageBundle("en")[key] ?? key;
  for (const [k, v] of Object.entries(vars)) {
    text = text.replaceAll(`{${k}}`, String(v ?? ""));
  }
  return text;
}

/** True when text has almost no Indic script (likely English in a localized advisory). */
export function isMostlyLatin(text) {
  if (!text || typeof text !== "string") return false;
  const trimmed = text.trim();
  if (trimmed.length < 12) return false;
  const indic = (trimmed.match(INDIC_SCRIPT) || []).length;
  const arabic = (trimmed.match(ARABIC_SCRIPT) || []).length;
  const native = indic + arabic;
  return native / trimmed.length < 0.08;
}

/**
 * True when farmer-facing text looks English but a non-English language was requested.
 */
export function needsLocalization(text, lang) {
  const code = normalizeAdvisoryLanguage(lang);
  if (code === "en") return false;
  if (!text || typeof text !== "string") return false;
  const trimmed = text.trim();
  if (trimmed.length < 6) return false;

  const latin = (trimmed.match(/[A-Za-z]/g) || []).length;
  const letters = (trimmed.match(/\p{L}/gu) || []).length;
  if (letters === 0) return isMostlyLatin(trimmed);

  if (latin / letters > 0.45) return true;
  return isMostlyLatin(trimmed);
}

function localizedDetailValues(details, lang) {
  if (!details || typeof details !== "object") return details;
  const out = { ...details };
  for (const [key, value] of Object.entries(out)) {
    if (typeof value === "string" && needsLocalization(value, lang)) {
      delete out[key];
    }
  }
  return out;
}

/**
 * Replace English-only LLM activity text with localized rule-based messages.
 */
export function mergeLocalizedActivities(activitiesToDo, fallbackActivities, language) {
  const lang = normalizeAdvisoryLanguage(language);
  if (lang === "en" || !Array.isArray(fallbackActivities)) {
    return activitiesToDo;
  }

  const fallbackMap = new Map(
    fallbackActivities.filter((a) => a?.type).map((a) => [a.type, a]),
  );

  return (activitiesToDo || []).map((act) => {
    const fb = fallbackMap.get(act?.type);
    if (!fb) return act;

    const msg = (act?.message || "").trim();
    const fbMsg = (fb.message || "").trim();
    const fbTitle = (fb.title || "").trim();
    const titleNeeds = needsLocalization(act?.title, lang);
    const msgNeeds = needsLocalization(msg, lang);
    const fbHasLocalized =
      (fbMsg && !needsLocalization(fbMsg, lang)) ||
      (fbTitle && !needsLocalization(fbTitle, lang));

    if (!fbHasLocalized) return act;

    if (msgNeeds || titleNeeds || !msg) {
      return {
        ...act,
        title: fbTitle || act.title,
        message: fbMsg || msg,
        details:
          fb.details && Object.keys(fb.details).length
            ? { ...localizedDetailValues(act.details, lang), ...fb.details }
            : act.details,
      };
    }
    return act;
  });
}

/**
 * Final pass: ensure every activity uses the target language (rule-based fallback per type).
 */
export function finalizeAdvisoryLanguage(activitiesToDo, fallbackActivities, language) {
  const lang = normalizeAdvisoryLanguage(language);
  if (lang === "en" || !Array.isArray(fallbackActivities)) {
    return activitiesToDo;
  }
  return mergeLocalizedActivities(activitiesToDo, fallbackActivities, lang);
}
