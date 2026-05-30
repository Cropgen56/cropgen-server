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
  /[\u0900-\u097F\u0980-\u09FF\u0A00-\u0A7F\u0A80-\u0AFF\u0B00-\u0B7F\u0B80-\u0BFF\u0C00-\u0C7F\u0C80-\u0CFF\u0D00-\u0D7F\u1C50-\u1C7F\uABC0-\uABFF]/;

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
    if (
      typeof value === "string" &&
      needsLocalization(value, lang) &&
      !hasNativeScript(value)
    ) {
      delete out[key];
    }
  }
  return out;
}

function mergeDetailFields(actDetails, fbDetails, lang) {
  const out = actDetails && typeof actDetails === "object" ? { ...actDetails } : {};
  if (!fbDetails || typeof fbDetails !== "object") {
    return localizedDetailValues(out, lang);
  }

  for (const [key, fbValue] of Object.entries(fbDetails)) {
    if (fbValue == null) continue;
    const actValue = out[key];
    if (typeof fbValue === "string") {
      const fbLocalized = hasNativeScript(fbValue) || !needsLocalization(fbValue, lang);
      const actNeedsReplace =
        typeof actValue !== "string" ||
        !actValue ||
        (!hasNativeScript(actValue) && needsLocalization(actValue, lang));
      if (fbLocalized && actNeedsReplace) {
        out[key] = fbValue;
      }
      continue;
    }
    if (Array.isArray(fbValue) && fbValue.length > 0 && (!Array.isArray(actValue) || !actValue.length)) {
      out[key] = fbValue;
    }
  }

  return localizedDetailValues(out, lang);
}

function hasNativeScript(text) {
  return INDIC_SCRIPT.test(text) || ARABIC_SCRIPT.test(text);
}

/** Remove trailing " - <english fragment>" often added during English post-processing. */
export function stripEnglishMessageSuffix(message, lang) {
  const code = normalizeAdvisoryLanguage(lang);
  if (code === "en" || !message) return message;

  const trimmed = String(message).trim();
  const match = trimmed.match(/^(.+?)\s+-\s+(.+)$/s);
  if (!match) return trimmed;

  const [, main, suffix] = match;
  if (!hasNativeScript(main)) return trimmed;

  const suffixHasNative = hasNativeScript(suffix);
  const suffixHasLatin = /[A-Za-z]/.test(suffix);
  if (!suffixHasNative && (suffixHasLatin || /^[\d.\-°%]+/.test(suffix.trim()))) {
    return main.trim();
  }
  return trimmed;
}

function slugifyStageName(stageName) {
  return String(stageName || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

export function localizeGrowStageName(stageName, lang) {
  if (!stageName) return stageName;
  const code = normalizeAdvisoryLanguage(lang);
  if (code === "en") return stageName;
  const key = `grow_stage_${slugifyStageName(stageName)}`;
  const translated = t(key, lang);
  return translated === key ? stageName : translated;
}

export function localizeGrowStageDescription(description, lang) {
  if (!description) return description;
  const code = normalizeAdvisoryLanguage(lang);
  if (code === "en") return description;
  const key = `grow_stage_desc_${slugifyStageName(description)}`;
  const translated = t(key, lang);
  return translated === key ? description : translated;
}

export function localizeHealthCategory(category, lang) {
  if (!category) return category;
  const code = normalizeAdvisoryLanguage(lang);
  if (code === "en") return category;
  const key = `health_category_${String(category).toLowerCase()}`;
  const translated = t(key, lang);
  return translated === key ? category : translated;
}

export function localizePlantGrowthActivity(plantGrowthActivity, lang) {
  if (!plantGrowthActivity || normalizeAdvisoryLanguage(lang) === "en") {
    return plantGrowthActivity;
  }

  const localized = {
    ...plantGrowthActivity,
    stageName: localizeGrowStageName(plantGrowthActivity.stageName, lang),
    description: localizeGrowStageDescription(plantGrowthActivity.description, lang),
  };

  if (plantGrowthActivity.signals && typeof plantGrowthActivity.signals === "object") {
    localized.signals = {};
    for (const [signalKey, signal] of Object.entries(plantGrowthActivity.signals)) {
      localized.signals[signalKey] = signal
        ? {
            ...signal,
            stageName: localizeGrowStageName(signal.stageName, lang),
          }
        : signal;
    }
  }

  return localized;
}

export function localizeAdvisoryMetadata({
  plantGrowthActivity,
  cropHealth,
  npkManagement,
  language,
}) {
  const code = normalizeAdvisoryLanguage(language);
  if (code === "en") {
    return { plantGrowthActivity, cropHealth, npkManagement };
  }

  const localizedGrowth = localizePlantGrowthActivity(plantGrowthActivity, code);
  const localizedHealth = cropHealth
    ? {
        ...cropHealth,
        category: localizeHealthCategory(cropHealth.category, code),
      }
    : cropHealth;

  let localizedNpk = npkManagement;
  if (
    npkManagement?.recommendation &&
    plantGrowthActivity?.stageName &&
    localizedGrowth?.stageName &&
    plantGrowthActivity.stageName !== localizedGrowth.stageName
  ) {
    localizedNpk = {
      ...npkManagement,
      recommendation: npkManagement.recommendation.replaceAll(
        plantGrowthActivity.stageName,
        localizedGrowth.stageName,
      ),
    };
  }

  return {
    plantGrowthActivity: localizedGrowth,
    cropHealth: localizedHealth,
    npkManagement: localizedNpk,
  };
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
    const msg = stripEnglishMessageSuffix((act?.message || "").trim(), lang);
    const mergedDetails = mergeDetailFields(act.details, fb?.details, lang);

    if (!fb) {
      return { ...act, message: msg, details: mergedDetails };
    }

    const fbMsg = (fb.message || "").trim();
    const fbTitle = (fb.title || "").trim();
    const titleNeeds = needsLocalization(act?.title, lang);
    const msgNeeds = needsLocalization(msg, lang);
    const fbHasLocalized =
      (fbMsg && (hasNativeScript(fbMsg) || !needsLocalization(fbMsg, lang))) ||
      (fbTitle && (hasNativeScript(fbTitle) || !needsLocalization(fbTitle, lang)));

    if (!fbHasLocalized) {
      return { ...act, message: msg, details: mergedDetails };
    }

    if (msgNeeds || titleNeeds || !msg) {
      return {
        ...act,
        title: fbTitle || act.title,
        message: fbMsg || msg,
        details: mergedDetails,
      };
    }

    return {
      ...act,
      message: msg,
      details: mergedDetails,
    };
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

const ACTIVITY_TITLE_KEYS = {
  SPRAY: "title_spray",
  FERTIGATION: "title_fertigation",
  IRRIGATION: "title_irrigation",
  WEATHER: "title_weather_crop",
  CROP_RISK: "title_crop_risk",
  MONITORING: "title_monitoring_crop",
  CARBON_TRACKING: "title_carbon_crop",
};

/**
 * Light cleanup for LLM activities — keep model text, only fix English gaps.
 * Rule-based strings are used only when a title/message is missing or still English.
 */
export function sanitizeLlmActivities(activitiesToDo, fallbackActivities, language) {
  const lang = normalizeAdvisoryLanguage(language);
  const fallbackMap = new Map(
    (fallbackActivities || []).filter((a) => a?.type).map((a) => [a.type, a]),
  );

  return (activitiesToDo || []).map((act) => {
    const type = String(act?.type || "").toUpperCase();
    const fb = fallbackMap.get(type);
    let message = stripEnglishMessageSuffix((act?.message || "").trim(), lang);
    let title = (act?.title || "").trim();

    if (lang !== "en") {
      const titleKey = ACTIVITY_TITLE_KEYS[type];
      if (titleKey && (!title || (!hasNativeScript(title) && needsLocalization(title, lang)))) {
        title = t(titleKey, lang);
      }

      const msgMissing = !message;
      const msgEnglishOnly =
        message && !hasNativeScript(message) && needsLocalization(message, lang);
      if ((msgMissing || msgEnglishOnly) && fb?.message) {
        message = (fb.message || "").trim();
      }
    }

    let details = act.details;
    if (lang !== "en") {
      details = fb
        ? mergeDetailFields(act.details, fb.details, lang)
        : localizedDetailValues(act.details, lang);
    }

    return {
      ...act,
      title: title || act.title || type,
      message,
      details,
    };
  });
}
