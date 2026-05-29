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
  return indic / trimmed.length < 0.08;
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
    const titleLatin = isMostlyLatin(act?.title);
    const msgLatin = isMostlyLatin(msg);

    if ((msgLatin && fbMsg && !isMostlyLatin(fbMsg)) || (titleLatin && fb.title)) {
      return {
        ...act,
        title: fb.title || act.title,
        message: fbMsg || msg,
        details:
          fb.details && Object.keys(fb.details).length
            ? fb.details
            : act.details,
      };
    }
    return act;
  });
}
