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

/** @deprecated Use ADVISORY_LANGUAGE_NAMES — kept for LLM modules */
export const LANGUAGE_MAP = ADVISORY_LANGUAGE_NAMES;
