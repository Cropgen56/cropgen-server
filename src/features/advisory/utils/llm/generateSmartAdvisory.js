import { callOpenAI } from "./openaiClient.js";
import { normalizeTypeOfFarming } from "../shared/farmingTypeNormalize.js";
import { postProcessAdvisory } from "./postProcessAdvisory.js";

const LANGUAGE_MAP = {
  en: "English",
  hi: "Hindi",
  mr: "Marathi",
};

function buildFertigationActivityFromHints(language, evidence) {
  const farmType = normalizeTypeOfFarming(evidence?.typeOfFarming);
  const fert = evidence?.decisionHints?.fertigation;
  const irrigationType = (evidence?.irrigationType || "").toLowerCase();
  const isDrip = irrigationType.includes("drip");
  const methodFallback = isDrip ? "Drip fertigation" : "Broadcast with irrigation";

  if (!fert?.shouldFertigate || !fert.hint) {
    return {
      type: "FERTIGATION",
      title: farmType === "Organic" ? "Organic fertilizer" : farmType === "Inorganic" ? "Inorganic fertilizer" : "Integrated fertilizer",
      message: "No fertigation needed today.",
      details: {
        fertilizer: "",
        quantity: "",
        method: methodFallback,
        time: "",
      },
    };
  }

  const hint = fert.hint;
  return {
    type: "FERTIGATION",
    title: farmType === "Organic" ? "Organic fertilizer" : farmType === "Inorganic" ? "Inorganic fertilizer" : "Integrated fertilizer",
    message: hint.quantity
      ? `${hint.fertilizer || "Fertilizer"}: ${hint.quantity}. ${hint.time || ""}`.trim()
      : "Apply scheduled fertigation.",
    details: {
      fertilizer: hint.fertilizer || "",
      quantity: hint.quantity || "",
      method: hint.method || methodFallback,
      time: hint.time || "",
      farmerSteps: Array.isArray(hint.farmerSteps) ? hint.farmerSteps : [],
      organicProducts: hint.organicPortion || [],
      chemicalProducts: hint.chemicalPortion || [],
    },
  };
}

function buildLLMPrompt(languageName, evidence) {
  return `You are a senior agronomist generating a daily farm advisory.
Output ONLY JSON with this shape:
{
  "activitiesToDo": [
    {"type":"SPRAY","title":"string","message":"string","details":{}},
    {"type":"FERTIGATION","title":"string","message":"string","details":{}},
    {"type":"IRRIGATION","title":"string","message":"string","details":{}},
    {"type":"WEATHER","title":"string","message":"string","details":{}},
    {"type":"CROP_RISK","title":"string","message":"string","details":{}},
    {"type":"MONITORING","title":"string","message":"string","details":{}},
    {"type":"CARBON_TRACKING","title":"string","message":"string","details":{}}
  ]
}
Language must be ${languageName}.
Use only this evidence:
${JSON.stringify(evidence, null, 2)}
`;
}

export async function generateSmartAdvisory({
  language = "en",
  evidence,
}) {
  const selectedLanguage = LANGUAGE_MAP[language] || "English";
  const prompt = buildLLMPrompt(selectedLanguage, evidence);
  const response = await callOpenAI(prompt);

  if (!response || !Array.isArray(response.activitiesToDo)) {
    console.warn("Advisory LLM returned no usable JSON; skipping AI activities");
    return null;
  }

  return postProcessAdvisory(
    response,
    evidence,
    language,
    buildFertigationActivityFromHints,
  );
}
