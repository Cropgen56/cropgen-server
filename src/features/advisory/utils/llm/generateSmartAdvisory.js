import { callOpenAI } from "./openaiClient.js";
import { postProcessAdvisory } from "./postProcessAdvisory.js";

const REQUIRED_TYPES = [
  "SPRAY",
  "FERTIGATION",
  "IRRIGATION",
  "WEATHER",
  "CROP_RISK",
  "MONITORING",
  "CARBON_TRACKING",
];

const LANGUAGE_MAP = {
  en: "English",
  hi: "Hindi",
  mr: "Marathi",
  fr: "French",
  gu: "Gujarati",
  bn: "Bengali",
  ta: "Tamil",
  ur: "Urdu",
  de: "German",
  es: "Spanish",
};

function buildLanguageRules(languageCode, languageName) {
  if (languageCode === "en") {
    return `OUTPUT LANGUAGE (MANDATORY):
- Write EVERY title, message, and details value in English only.
- Do not use Hindi, Marathi, or any other language in this response.`;
  }

  const scriptNote =
    languageCode === "hi" || languageCode === "mr"
      ? "Use the native script (Devanagari for Hindi and Marathi)."
      : "Use the standard native script for this language.";

  return `OUTPUT LANGUAGE (MANDATORY):
- Requested language: ${languageName} (code: ${languageCode}).
- Write EVERY title, message, and details value entirely in ${languageName} only. ${scriptNote}
- Do NOT mix English with ${languageName} in the same field or activity.
- Evidence JSON below may be in English — translate all farmer-facing text into ${languageName}.
- Allowed exceptions: product brand names, chemical names, and units (°C, mm, %, kg/acre, L/min).`;
}

function buildLLMPrompt(languageCode, languageName, evidence) {
  const languageRules = buildLanguageRules(languageCode, languageName);

  return `CROP ADVISORY SYSTEM PROMPT — ACTIVITIES TO DO GENERATOR

Objective:
Generate a structured activitiesToDo array for a crop advisory system. Each activity must provide clear, actionable, and farmer-friendly guidance.

${languageRules}

STRICT OUTPUT RULES:
1. Always return an object with key "activitiesToDo" containing exactly 7 activity objects.
2. Required types (all mandatory, in this order): SPRAY, FERTIGATION, IRRIGATION, WEATHER, CROP_RISK, MONITORING, CARBON_TRACKING.
3. Each activity object must include: type, title, message, details (object; use {} if no extra fields).
4. Keep titles short and specific.
5. Keep messages short, practical, and clear.
6. When recommending products, use exact product names, purpose, and quantity per acre/hectare.
7. If no action is required for an activity, say so clearly in that activity's message (still in ${languageName}).
8. Base irrigation and fertigation on decisionHints and irrigationRequirement in the evidence.
9. Do not generate unnecessary actions.

ACTIVITY TYPE RULES:

1. FERTIGATION — products, applicationMethod, timing, reason when action needed.
2. SPRAY — products, applicationMethod, timing, notes when action needed.
3. IRRIGATION — applicationMethod, timing, duration, waterQuantity, reason, frequency when irrigating.
4. WEATHER — temperature, humidity, rainfallProbability, advisory in details.
5. CROP_RISK — riskLevel, cause, recommendedAction in details.
6. MONITORING — focusAreas, whatToCheck, frequency in details.
7. CARBON_TRACKING — emission/capture/balance and sustainability note when data exists.

IMPORTANT DECISION LOGIC:
- Harvest stage: avoid unnecessary spray and fertigation.
- Adequate soil moisture: do not recommend irrigation.
- Use decisionHints.spray, decisionHints.fertigation, decisionHints.irrigation, irrigationRequirement.

Return ONLY valid JSON:
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

Evidence (facts; output language is ${languageName} only):
${JSON.stringify(evidence, null, 2)}
`;
}

function buildFillMissingPrompt(languageCode, languageName, evidence, missingTypes) {
  return `Complete ONLY these missing farm advisory activities in ${languageName} (${languageCode}).
Every title, message, and details value must be in ${languageName} only — no English except product names and units.

Missing types: ${missingTypes.join(", ")}

Return JSON: { "activitiesToDo": [ ...one object per missing type... ] }

Evidence:
${JSON.stringify(evidence, null, 2)}
`;
}

async function fillMissingActivities(languageCode, languageName, evidence, existingMap) {
  const missing = REQUIRED_TYPES.filter((t) => !existingMap.has(t) || !(existingMap.get(t)?.message || "").trim());
  if (!missing.length) return existingMap;

  const fillResponse = await callOpenAI(
    buildFillMissingPrompt(languageCode, languageName, evidence, missing),
  );
  if (!fillResponse?.activitiesToDo) return existingMap;

  for (const act of fillResponse.activitiesToDo) {
    if (act?.type && missing.includes(act.type)) {
      existingMap.set(act.type, act);
    }
  }
  return existingMap;
}

export async function generateSmartAdvisory({
  language = "en",
  evidence,
}) {
  const languageCode = LANGUAGE_MAP[language] ? language : "en";
  const languageName = LANGUAGE_MAP[languageCode] || "English";
  const prompt = buildLLMPrompt(languageCode, languageName, evidence);
  const response = await callOpenAI(prompt);

  if (!response || !Array.isArray(response.activitiesToDo)) {
    console.warn("Advisory LLM returned no usable JSON; skipping AI activities");
    return null;
  }

  const activityMap = new Map();
  response.activitiesToDo.forEach((a) => {
    if (a?.type) activityMap.set(a.type, a);
  });

  await fillMissingActivities(languageCode, languageName, evidence, activityMap);

  const fullOutput = {
    activitiesToDo: REQUIRED_TYPES.map((type) => {
      return (
        activityMap.get(type) || {
          type,
          title: type,
          message: "",
          details: {},
        }
      );
    }),
  };

  return postProcessAdvisory(fullOutput, evidence);
}
