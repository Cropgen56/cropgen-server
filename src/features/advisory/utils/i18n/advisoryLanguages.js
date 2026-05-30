/**
 * Supported farmer-facing advisory languages (aligned with app i18n resources).
 * Add a matching `<code>.json` under `messages/` for rule-based strings; missing files fall back to English.
 */

export const ADVISORY_LANGUAGE_CODES = [
  "as",
  "bn",
  "brx",
  "doi",
  "en",
  "gu",
  "hi",
  "kn",
  "ks",
  "kok",
  "ml",
  "mni",
  "mr",
  "mai",
  "ne",
  "or",
  "pa",
  "sa",
  "sat",
  "sd",
  "ta",
  "te",
  "ur",
];

/** ISO-style code → English name for LLM output-language instructions */
export const ADVISORY_LANGUAGE_NAMES = {
  as: "Assamese",
  bn: "Bengali",
  brx: "Bodo",
  doi: "Dogri",
  en: "English",
  gu: "Gujarati",
  hi: "Hindi",
  kn: "Kannada",
  ks: "Kashmiri",
  kok: "Konkani",
  ml: "Malayalam",
  mni: "Manipuri",
  mr: "Marathi",
  mai: "Maithili",
  ne: "Nepali",
  or: "Odia",
  pa: "Punjabi",
  sa: "Sanskrit",
  sat: "Santali",
  sd: "Sindhi",
  ta: "Tamil",
  te: "Telugu",
  ur: "Urdu",
};

const CODE_SET = new Set(ADVISORY_LANGUAGE_CODES);

/** Longest-match normalization (supports 3-letter codes: kok, brx, mai, mni, sat, doi). */
export function normalizeAdvisoryLanguage(lang) {
  const raw = String(lang || "en")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
  if (!raw) return "en";
  if (CODE_SET.has(raw)) return raw;
  const two = raw.slice(0, 2);
  if (CODE_SET.has(two)) return two;
  return "en";
}

export function isAdvisoryLanguageSupported(lang) {
  return CODE_SET.has(normalizeAdvisoryLanguage(lang));
}

export function getAdvisoryLanguageName(lang) {
  const code = normalizeAdvisoryLanguage(lang);
  return ADVISORY_LANGUAGE_NAMES[code] || ADVISORY_LANGUAGE_NAMES.en;
}

/** Native script hint for LLM advisory generation (all 23 languages). */
export function getAdvisoryScriptNote(languageCode) {
  const code = normalizeAdvisoryLanguage(languageCode);
  if (code === "en") return "Use English only.";

  const devanagari = new Set(["hi", "mr", "mai", "ne", "kok", "doi", "sa", "brx"]);
  const bengali = new Set(["bn", "as"]);
  const arabic = new Set(["ur", "sd", "ks"]);

  if (devanagari.has(code)) {
    return "Use the native script (Devanagari where standard for this language).";
  }
  if (bengali.has(code)) return "Use Bengali/Assamese script as standard for this language.";
  if (code === "gu") return "Use Gujarati script.";
  if (code === "pa") return "Use Gurmukhi script.";
  if (code === "or") return "Use Odia script.";
  if (code === "ta") return "Use Tamil script.";
  if (code === "te") return "Use Telugu script.";
  if (code === "kn") return "Use Kannada script.";
  if (code === "ml") return "Use Malayalam script.";
  if (code === "sat") return "Use Ol Chiki script.";
  if (code === "mni") return "Use Meitei Mayek script.";
  if (arabic.has(code)) return "Use Arabic script (Nastaliq for Urdu where standard).";
  return "Use the standard native script for this language.";
}

/** @deprecated Use ADVISORY_LANGUAGE_NAMES — kept for LLM modules */
export const LANGUAGE_MAP = ADVISORY_LANGUAGE_NAMES;
