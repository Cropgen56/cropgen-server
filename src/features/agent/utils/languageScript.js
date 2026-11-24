/**
 * Script-level check that a reply is in the farmer's profile language.
 * Languages that share a script (Hindi/Marathi/… all Devanagari) cannot be told apart this
 * way — for those only the prompt enforces the exact language.
 */
const RANGES = {
  devanagari: /[ऀ-ॿ]/g,
  bengali: /[ঀ-৿]/g, // Bengali + Assamese
  gurmukhi: /[਀-੿]/g,
  gujarati: /[઀-૿]/g,
  odia: /[଀-୿]/g,
  tamil: /[஀-௿]/g,
  telugu: /[ఀ-౿]/g,
  kannada: /[ಀ-೿]/g,
  malayalam: /[ഀ-ൿ]/g,
  arabic: /[؀-ۿݐ-ݿ]/g,
  latin: /[A-Za-z]/g,
};

const SCRIPT_OF = {
  en: "latin",
  hi: "devanagari", mr: "devanagari", ne: "devanagari", kok: "devanagari",
  mai: "devanagari", sa: "devanagari", doi: "devanagari", brx: "devanagari",
  bn: "bengali", as: "bengali",
  pa: "gurmukhi", gu: "gujarati", or: "odia",
  ta: "tamil", te: "telugu", kn: "kannada", ml: "malayalam",
  ur: "arabic", sd: "arabic",
  // ks, mni, sat: more than one script in use — not checked
};

const count = (text, re) => (String(text).match(re) || []).length;

// Hindi and Marathi share Devanagari. Tell them apart by words/suffixes the other never uses.
const MARATHI_EXACT = new Set(["आहे", "आहेत", "आणि", "नाही", "नका", "असतो", "असते", "असतात", "असेल", "होतो", "होते", "होती", "करावा", "करावी", "करावे", "शकते", "शकतो", "शकतात", "तुमच्या", "तुम्ही", "आपल्या", "किंवा", "म्हणून", "मात्र", "फक्त", "ठरू"]);
const MARATHI_SUFFIX = ["च्या", "साठी", "मध्ये", "ाला", "ाचा", "ाची", "ाचे", "ांना", "ांची", "ांचा", "ातील"];
const HINDI_EXACT = new Set(["है", "हैं", "और", "नहीं", "में", "को", "से", "के", "यह", "वह", "इस", "उस", "करें", "होता", "होती", "होते", "सकता", "सकती", "सकते", "आपके", "आपकी", "आपको", "लिए", "तथा", "था", "थी", "थे"]);

function variantScores(text) {
  let mr = 0;
  let hi = 0;
  for (const tok of String(text).split(/[\s,.;:!?()•"'\-–—/]+/)) {
    if (!tok) continue;
    if (MARATHI_EXACT.has(tok) || (tok.length > 4 && MARATHI_SUFFIX.some((x) => tok.endsWith(x)))) mr++;
    if (HINDI_EXACT.has(tok)) hi++;
  }
  return { mr, hi };
}
/** True if the reply is mostly in the profile language's script (or the language is unchecked). */
export function replyInProfileScript(rawText, languageCode) {
  // Links, domains and citation markers are Latin text but are not "the language of the reply".
  const text = String(rawText || "")
    .replace(/\[[^\]]*\]\(https?:\/\/[^)\s]*\)/g, " ")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/\b[\w-]+(?:\.[\w-]+)+\b/g, " ")
    .replace(/\[\d+\]/g, " ");
  const script = SCRIPT_OF[String(languageCode || "en").toLowerCase()];
  if (!script) return true;
  const total = Object.values(RANGES).reduce((n, re) => n + count(text, re), 0);
  if (total < 25) return true; // too short to judge ("OK", a name, …)
  const own = count(text, RANGES[script]);
  const code = String(languageCode).toLowerCase();
  if (code === "hi" || code === "mr") {
    const { mr, hi } = variantScores(text);
    // Clearly the other language (needs several marker words so short/neutral text passes).
    if (code === "hi" && mr >= 3 && hi <= 1) return false;
    if (code === "mr" && hi >= 3 && mr <= 1) return false;
  }
  // Latin letters are tolerated (crop/brand names, units) — need a clear majority in-script.
  return own / total >= (script === "latin" ? 0.8 : 0.6);
}
