import { callOpenAI } from "./openaiClient.js";
import { postProcessAdvisory } from "./postProcessAdvisory.js";
import {
  getAdvisoryLanguageName,
  isAdvisoryLanguageSupported,
  normalizeAdvisoryLanguage,
} from "../i18n/advisoryLanguages.js";

const REQUIRED_TYPES = [
  "SPRAY",
  "FERTIGATION",
  "IRRIGATION",
  "WEATHER",
  "CROP_RISK",
  "MONITORING",
  "CARBON_TRACKING",
];

const DEVANAGARI_LANGS = new Set(["hi", "mr", "mai", "ne", "kok", "doi", "sa"]);

function buildBarrenLandPrompt(languageCode, languageName, evidence) {
  const scriptNote = DEVANAGARI_LANGS.has(languageCode)
    ? "Use the native script (Devanagari where standard for this language)."
    : "Use the standard native script for this language.";

  const langRules =
    languageCode === "en"
      ? "Write ALL farmer-facing text in English only."
      : `Write ALL farmer-facing text in ${languageName} only. ${scriptNote} Do not mix English except product names and units.`;

  return `BARREN LAND / PRE-SOWING ADVISORY — ACTIVITIES GENERATOR

Context:
- The field has NO standing crop (barren / fallow).
- sowingDate in evidence is the EXPECTED sowing date, not past sowing.
- Planned crop: ${evidence.cropType || "crop"} (${evidence.plannedVariety || ""}).
- Days until sowing: ${evidence.daysUntilSowing ?? "unknown"}.
- Phase: ${evidence.preSowingPhase}.

Objective:
Guide the farmer on what to do BEFORE sowing: land preparation, weed/stubble management, basal fertilizer planning, pre-sowing irrigation, seed treatment, sowing window vs weather, risks of delay, field monitoring, and organic matter / carbon practices.

${langRules}

STRICT RULES:
1. Return JSON: { "activitiesToDo": [ exactly 7 objects ] }.
2. Types in order: SPRAY, FERTIGATION, IRRIGATION, WEATHER, CROP_RISK, MONITORING, CARBON_TRACKING.
3. EVERY title and message MUST be in ${languageName} only — zero English sentences when language is not English.
4. Do NOT give in-season crop spray/fertigation advice as if a crop is standing.
5. SPRAY = weed/stubble/pre-emergence on bare soil only if decisionHints.spray.shouldSpray is true.
6. FERTIGATION = basal / soil fertilizer planning or application before sowing.
7. IRRIGATION = pre-sowing seedbed moisture only if decisionHints.irrigation.shouldIrrigate is true.
8. WEATHER must reference sowingWindow and daysUntilSowing.
9. CROP_RISK = risks to timely sowing (rain, dry soil, delayed date).
10. MONITORING = land prep checklist from decisionHints.landPreparation.tasks.
11. CARBON_TRACKING = compost/FYM/residue before sowing.
12. Follow decisionHints — they are ground truth.

Evidence:
${JSON.stringify(evidence, null, 2)}
`;
}

export async function generateBarrenLandAdvisory({ language = "en", evidence }) {
  const languageCode = isAdvisoryLanguageSupported(language)
    ? normalizeAdvisoryLanguage(language)
    : "en";
  const languageName = getAdvisoryLanguageName(languageCode);
  const prompt = buildBarrenLandPrompt(languageCode, languageName, evidence);
  const response = await callOpenAI(prompt);

  if (!response || !Array.isArray(response.activitiesToDo)) {
    return null;
  }

  const activityMap = new Map();
  response.activitiesToDo.forEach((a) => {
    if (a?.type) activityMap.set(a.type, a);
  });

  const fullOutput = {
    activitiesToDo: REQUIRED_TYPES.map(
      (type) =>
        activityMap.get(type) || {
          type,
          title: type,
          message: "",
          details: {},
        },
    ),
  };

  return postProcessAdvisory(fullOutput, evidence);
}
