/**
 * Farmer UI / agent languages — must match user.model.js `language` enum.
 */
export const FARMER_LANGUAGE_CODES = [
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

/** @type {{ code: string, label: string, native: string }[]} */
export const FARMER_LANGUAGES = [
  { code: "en", label: "English", native: "English" },
  { code: "hi", label: "Hindi", native: "हिंदी" },
  { code: "bn", label: "Bengali", native: "বাংলা" },
  { code: "ta", label: "Tamil", native: "தமிழ்" },
  { code: "te", label: "Telugu", native: "తెలుగు" },
  { code: "kn", label: "Kannada", native: "ಕನ್ನಡ" },
  { code: "ml", label: "Malayalam", native: "മലയാളം" },
  { code: "mr", label: "Marathi", native: "मराठी" },
  { code: "gu", label: "Gujarati", native: "ગુજરાતી" },
  { code: "pa", label: "Punjabi", native: "ਪੰਜਾਬੀ" },
  { code: "or", label: "Odia", native: "ଓଡ଼ିଆ" },
  { code: "as", label: "Assamese", native: "অসমীয়া" },
  { code: "ur", label: "Urdu", native: "اردو" },
  { code: "ne", label: "Nepali", native: "नेपाली" },
  { code: "kok", label: "Konkani", native: "कोंकणी" },
  { code: "mai", label: "Maithili", native: "मैथिली" },
  { code: "sd", label: "Sindhi", native: "سنڌي" },
  { code: "ks", label: "Kashmiri", native: "कॉशुर" },
  { code: "doi", label: "Dogri", native: "डोगरी" },
  { code: "brx", label: "Bodo", native: "बड़ो" },
  { code: "mni", label: "Manipuri", native: "মৈতৈলোন্" },
  { code: "sat", label: "Santali", native: "ᱥᱟᱱᱛᱟᱲᱤ" },
  { code: "sa", label: "Sanskrit", native: "संस्कृतम्" },
];

const CODE_SET = new Set(FARMER_LANGUAGE_CODES);
const BY_CODE = new Map(FARMER_LANGUAGES.map((l) => [l.code, l]));

export function normalizeFarmerLanguage(code) {
  const c = String(code || "en").toLowerCase();
  return CODE_SET.has(c) ? c : "en";
}

/** Human-readable name for system prompts (English label + native script). */
export function getFarmerLanguagePromptDescriptor(code) {
  const lang = BY_CODE.get(normalizeFarmerLanguage(code));
  if (!lang) return "English (English)";
  return `${lang.label} (${lang.native})`;
}

const SUPPORTED_LIST = FARMER_LANGUAGE_CODES.join(", ");

/**
 * Language block injected into agent system prompts.
 * @param {{ mode: 'profile'|'public_auto', language?: string }} opts
 */
export function buildFarmerLanguageRules({ mode, language }) {
  if (mode === "public_auto") {
    return `=== LANGUAGE (mandatory) ===
• Reply in the same language the farmer uses when it matches one of these ISO codes: ${SUPPORTED_LIST}.
• If they mix languages, follow the language of their latest message.
• Use simple, clear wording (local crop/pest terms encouraged). Default to English only if the language is unclear or unsupported.
• Product or brand names (e.g. Bokashi) may stay in Latin script when needed; explain everything else in the reply language.`;
  }

  const lang = normalizeFarmerLanguage(language);
  const desc = getFarmerLanguagePromptDescriptor(lang);
  return `=== LANGUAGE (mandatory) ===
• This farmer's saved preferred language is ${desc} (code: ${lang}).
• ALWAYS write your entire reply in that language — simple and clear for farmers.
• Product or brand names may stay in Latin script when there is no common local name; explain doses and steps in their language.
• If they write in another supported Indian language, still answer in ${desc} unless they explicitly ask to switch language.`;
}
