import { callOpenAI } from "./openaiClient.js";
import { normalizeTypeOfFarming } from "../shared/farmingTypeNormalize.js";
import { postProcessAdvisory } from "./postProcessAdvisory.js";

const LANGUAGE_MAP = {
  en: "English",
  hi: "Hindi",
  mr: "Marathi",
};

const BIODROPS_BOKASHI_FERTIGATION_PRODUCT = {
  name: "BioDrops Mokashi Bokashi Bucket",
  category: "ORGANIC",
  purpose: "Adds organic matter and beneficial microbes for soil health improvement",
  dosage: "30 kg/acre solids; bokashi tea dilution 1:100",
};

function buildFertigationActivityFromHints(language, evidence) {
  const farmType = normalizeTypeOfFarming(evidence?.typeOfFarming);
  const fert = evidence?.decisionHints?.fertigation;
  const organizationCode = String(evidence?.organizationCode || "").toUpperCase();
  const isBioDrops = organizationCode === "BIODROPS";
  const irrigationType = (evidence?.irrigationType || "").toLowerCase();
  const isDrip = irrigationType.includes("drip");
  const methodFallback = isDrip ? "Drip" : "Soil application";
  const category =
    farmType === "Organic"
      ? "ORGANIC"
      : farmType === "Inorganic"
        ? "CHEMICAL"
        : "INTEGRATED";

  if (!fert?.shouldFertigate || !fert.hint) {
    return {
      type: "FERTIGATION",
      title: farmType === "Organic" ? "Organic fertilizer" : farmType === "Inorganic" ? "Inorganic fertilizer" : "Integrated fertilizer",
      message: "No fertigation needed today.",
      details: {
        products: isBioDrops ? [BIODROPS_BOKASHI_FERTIGATION_PRODUCT] : [],
        applicationMethod: methodFallback,
        timing: "",
        reason: fert?.reason || "Nutrients are balanced for current stage.",
        notes: isBioDrops
          ? "For BIODROPS farmers, Bokashi can be used as a periodic organic soil amendment."
          : "",
      },
    };
  }

  const hint = fert.hint;
  const products = [];
  if (hint.fertilizer || hint.quantity) {
    products.push({
      name: hint.fertilizer || "Nutrient input",
      category,
      purpose: "Correct nutrient deficiency for current crop stage",
      dosage: hint.quantity || "",
    });
  }

  const addPortionProducts = (portion, portionCategory) => {
    if (!Array.isArray(portion)) return;
    portion.forEach((name) => {
      if (!name) return;
      products.push({
        name,
        category: portionCategory,
        purpose: "Nutrient correction based on field requirement",
        dosage: "",
      });
    });
  };
  addPortionProducts(hint.organicPortion, "ORGANIC");
  addPortionProducts(hint.chemicalPortion, "CHEMICAL");
  if (isBioDrops) {
    products.push(BIODROPS_BOKASHI_FERTIGATION_PRODUCT);
  }

  return {
    type: "FERTIGATION",
    title: farmType === "Organic" ? "Organic fertilizer" : farmType === "Inorganic" ? "Inorganic fertilizer" : "Integrated fertilizer",
    message: hint.quantity
      ? `${hint.fertilizer || "Fertilizer"}: ${hint.quantity}. ${hint.time || ""}`.trim()
      : "Apply scheduled fertigation.",
    details: {
      products,
      applicationMethod: hint.method || methodFallback,
      timing: hint.time || "",
      reason: fert.reason || "Nutrient deficit detected for current crop stage.",
      notes: [
        Array.isArray(hint.farmerSteps) ? hint.farmerSteps.join("; ") : "",
        isBioDrops
          ? "BIODROPS recommendation: incorporate fermented Bokashi solids before planting; apply tea as diluted drench."
          : "",
      ]
        .filter(Boolean)
        .join("; "),
    },
  };
}

function buildLLMPrompt(languageName, evidence) {
  return `CROP ADVISORY SYSTEM PROMPT — ACTIVITIES TO DO GENERATOR

Objective:
Generate a structured activitiesToDo array for a crop advisory system. Each activity must provide clear, actionable, and farmer-friendly guidance. The output must be concise, specific, and based on the crop stage, field condition, weather, pest/disease risk, soil moisture, and nutrient status.

STRICT OUTPUT RULES:
1. Always return an object with key "activitiesToDo" containing an array of activity objects.
2. Each activity object must include:
   - type
   - title
   - message
   - details (when action is required)
3. Keep titles short, specific, and easy to read.
4. Keep messages short, practical, and clear.
5. Do not use vague terms like:
   - some fertilizer
   - pesticide
   - spray product
   - nutrient mix
6. Always mention the exact product name whenever a recommendation is given.
7. Always mention why the product is being used.
8. Always mention quantity in a clear format, preferably per acre or per hectare.
9. For spray, fertigation, irrigation, and integrated recommendations, give structured details.
10. If no action is required, clearly mention that in the message.
11. Do not generate unnecessary actions.
12. Make the response suitable for direct UI display in cards or alerts.

ACTIVITY TYPE RULES:

1. FERTIGATION
When fertigation is needed, include:
- exact product name
- product category: CHEMICAL / ORGANIC / BIO / INTEGRATED
- purpose of the product
- dosage per acre or per hectare
- application method
- timing
- reason for recommendation

Required structure:
{
  "type": "FERTIGATION",
  "title": "Short title",
  "message": "Short advisory message",
  "details": {
    "products": [
      {
        "name": "Urea",
        "category": "CHEMICAL",
        "purpose": "Provides nitrogen for vegetative growth",
        "dosage": "25 kg/acre"
      }
    ],
    "applicationMethod": "Drip / Soil application",
    "timing": "Morning / Evening",
    "reason": "Crop stage or nutrient deficiency"
  }
}

2. SPRAY
When spray is needed, include:
- exact spray product name
- category
- target pest or disease
- dosage per liter or per acre
- application method
- timing
- precautions or notes

Required structure:
{
  "type": "SPRAY",
  "title": "Short title",
  "message": "Short advisory message",
  "details": {
    "products": [
      {
        "name": "Neem Oil",
        "category": "ORGANIC",
        "purpose": "Controls sucking pests like aphids",
        "dosage": "3 ml/liter"
      }
    ],
    "applicationMethod": "Foliar Spray",
    "timing": "Evening",
    "notes": "Avoid spraying during high temperature"
  }
}

3. IRRIGATION
When irrigation is needed, include:
- irrigation method
- timing
- duration
- water quantity
- reason

Required structure:
{
  "type": "IRRIGATION",
  "title": "Short title",
  "message": "Short advisory message",
  "details": {
    "applicationMethod": "Drip / Flood / Sprinkler",
    "timing": "Early morning",
    "duration": "30–45 minutes",
    "waterQuantity": "20 liters/plant or 15 mm",
    "reason": "Soil moisture is below optimal level"
  }
}

4. WEATHER
When weather is included, provide:
- temperature
- humidity
- rainfall probability
- advisory impact on farming decisions

Required structure:
{
  "type": "WEATHER",
  "title": "Weather Forecast",
  "message": "Short weather advisory message",
  "details": {
    "temperature": "41.3°C",
    "humidity": "55%",
    "rainfallProbability": "10%",
    "advisory": "High temperature may increase irrigation need"
  }
}

5. CROP_RISK
When crop risk is included, provide:
- risk level
- cause
- recommended action

6. MONITORING
When monitoring is included, provide:
- focus areas
- what to check
- frequency

7. CARBON_TRACKING
When carbon tracking is included, provide:
- emission estimate
- capture estimate
- net balance if available
- recommendation for sustainability

IMPORTANT DECISION LOGIC:
1. If the crop is at harvest stage:
- avoid unnecessary spray
- avoid unnecessary fertigation
- only recommend actions that are truly required
2. If soil moisture is sufficient:
- do not recommend irrigation
3. If crop stress is detected:
- suggest irrigation, nutrient correction, or monitoring as needed
4. If advisory includes fertilizer or spray:
- always mention exact product names, purpose, and quantity per area
5. Keep all instructions short, actionable, and practical for real field use.

STYLE GUIDELINES:
- Use simple language.
- Be specific.
- Avoid long paragraphs.
- Avoid generic advice.
- Output should be clean JSON-compatible data.

Language must be ${languageName}.
Return ONLY valid JSON object with this exact top-level shape:
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
