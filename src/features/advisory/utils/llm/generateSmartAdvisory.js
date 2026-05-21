import { callOpenAI } from "./openaiClient.js";
import { normalizeTypeOfFarming } from "../shared/farmingTypeNormalize.js";
import { postProcessAdvisory } from "./postProcessAdvisory.js";

/**
 * LANGUAGE MAP — extend as needed
 * Output must be 100% in selected language
 * No English fallback unless language = "en"
 */
const LANGUAGE_MAP = {
  en: "English",
  hi: "Hindi",
  mr: "Marathi",
  te: "Telugu",
  kn: "Kannada",
  ta: "Tamil",
  gu: "Gujarati",
  pa: "Punjabi",
  bn: "Bengali",
  or: "Odia",
};

// Language-specific unit/term glossary injected into prompt
const LANGUAGE_GLOSSARY = {
  hi: {
    perAcre: "प्रति एकड़",
    total: "कुल",
    morning: "सुबह 6–9 बजे",
    evening: "शाम 4–6 बजे",
    drip: "ड्रिप",
    spray: "स्प्रे",
    fertigation: "फर्टिगेशन",
    irrigation: "सिंचाई",
    litre: "लीटर",
    kg: "किलो",
    g: "ग्राम",
    ml: "मिली",
    dissolve: "पानी में घोलकर",
    apply: "डालें",
  },
  mr: {
    perAcre: "प्रति एकर",
    total: "एकूण",
    morning: "सकाळी 6–9 वाजता",
    evening: "संध्याकाळी 4–6 वाजता",
    drip: "ठिबक",
    spray: "फवारणी",
    fertigation: "फर्टिगेशन",
    irrigation: "सिंचन",
    litre: "लिटर",
    kg: "किलो",
    g: "ग्राम",
    ml: "मिली",
    dissolve: "पाण्यात विरघळवून",
    apply: "द्या",
  },
  te: {
    perAcre: "ఎకరాకు",
    total: "మొత్తం",
    morning: "ఉదయం 6–9 గంటలు",
    evening: "సాయంత్రం 4–6 గంటలు",
  },
};

function buildFertigationActivityFromHints(language, evidence) {
  const farmType = normalizeTypeOfFarming(evidence?.typeOfFarming);
  const fert = evidence?.decisionHints?.fertigation;
  const irrigationType = (evidence?.irrigationType || "").toLowerCase();
  const isDrip = irrigationType.includes("drip");
  const methodFallback = isDrip ? "Drip fertigation" : "Soil application + irrigation";
  const acre = evidence?.acre ?? 1;

  const category =
    farmType === "Organic" ? "ORGANIC"
    : farmType === "Inorganic" ? "CHEMICAL"
    : "INTEGRATED";

  if (!fert?.shouldFertigate || !fert.hint) {
    return {
      type: "FERTIGATION",
      title: getFertigationTitle(language, farmType),
      message: getNoFertigationMessage(language, fert?.reason),
      details: {
        products: [],
        applicationMethod: methodFallback,
        timing: "",
        reason: fert?.reason || "Nutrients balanced for current stage.",
        micronutrients: fert?.micronutrients ?? [],
      },
    };
  }

  const hint = fert.hint;
  const allProducts = hint.allProducts ?? [];
  const micronutrients = hint.micronutrients ?? fert.micronutrients ?? [];

  // Build product list for UI
  const products = allProducts.map((p) => ({
    name: p.name,
    category: farmType === "Organic" ? "ORGANIC" : "CHEMICAL",
    purpose: p.purpose ?? "Nutrient correction based on crop stage",
    dosage: p.quantityKgPerAcre
      ? `${p.quantityKgPerAcre} kg/acre (total ${p.totalKgFarm ?? "?"} kg for ${acre} acre)`
      : p.quantityLitrePerAcre
      ? `${p.quantityLitrePerAcre} L/acre (total ${p.totalLitreFarm ?? "?"} L)`
      : p.quantityMLPerAcre
      ? `${p.quantityMLPerAcre} ml/acre`
      : hint.quantity ?? "",
    timing: p.timing ?? hint.time ?? "Morning",
    note: p.note ?? "",
  }));

  // Add organic supplement products (integrated)
  const organicSupplement = hint.organicSupplement ?? [];
  organicSupplement.forEach((p) => {
    products.push({
      name: p.name,
      category: "ORGANIC",
      purpose: p.purpose ?? "Organic growth support",
      dosage: p.quantityLitrePerAcre
        ? `${p.quantityLitrePerAcre} L/acre`
        : p.quantityMLPerAcre
        ? `${p.quantityMLPerAcre} ml/acre`
        : "",
      timing: p.timing ?? "Morning",
      note: p.note ?? "",
    });
  });

  // Build micronutrient product list
  const microProducts = micronutrients.map((m) => ({
    name: m.name,
    category: "MICRONUTRIENT",
    purpose: m.purpose ?? "Micronutrient deficiency correction",
    dosage: m.quantityGPerAcre
      ? `${m.quantityGPerAcre} g/acre (total ${m.totalGFarm ?? "?"} g)`
      : "",
    timing: m.timing ?? "Morning",
    method: m.method ?? "Foliar spray",
    note: m.note ?? "",
  }));

  const primaryMessage = products.length > 0
    ? buildFertigationMessage(language, products[0], isDrip, acre)
    : getNoFertigationMessage(language, "Schedule fertigation.");

  return {
    type: "FERTIGATION",
    title: getFertigationTitle(language, farmType),
    message: primaryMessage,
    details: {
      products,
      micronutrients: microProducts,
      applicationMethod: hint.method ?? methodFallback,
      timing: hint.time ?? "Morning 6–10 AM",
      reason: fert.reason ?? "Nutrient deficit for current crop stage.",
      compatibilityWarning: hint.compatibilityWarning ?? "",
      notes: Array.isArray(hint.farmerSteps) ? hint.farmerSteps.join("; ") : "",
      nutrientDeficit: hint.nutrientDeficit,
    },
  };
}

function getFertigationTitle(language, farmType) {
  const titles = {
    en: {
      Organic: "Organic Fertigation",
      Inorganic: "Chemical Fertigation",
      Integrated: "Integrated Fertigation",
    },
    hi: {
      Organic: "जैविक फर्टिगेशन",
      Inorganic: "रासायनिक फर्टिगेशन",
      Integrated: "एकीकृत फर्टिगेशन",
    },
    mr: {
      Organic: "सेंद्रिय फर्टिगेशन",
      Inorganic: "रासायनिक फर्टिगेशन",
      Integrated: "एकात्मिक फर्टिगेशन",
    },
  };
  return (titles[language] ?? titles["en"])[farmType] ?? "Fertigation";
}

function getNoFertigationMessage(language, reason) {
  const defaultMessages = {
    en: "No fertigation needed today.",
    hi: "आज फर्टिगेशन की जरूरत नहीं है।",
    mr: "आज फर्टिगेशन करण्याची गरज नाही.",
    te: "ఈరోజు ఫర్టిగేషన్ అవసరం లేదు.",
  };
  return reason
    ? reason
    : (defaultMessages[language] ?? defaultMessages["en"]);
}

function buildFertigationMessage(language, product, isDrip, acre) {
  // Build concise, field-practical message in correct language
  const method = isDrip
    ? (language === "mr" ? "ठिबकद्वारे" : language === "hi" ? "ड्रिप द्वारा" : "via drip")
    : (language === "mr" ? "जमिनीत" : language === "hi" ? "जमीन में" : "soil drench");

  const msg = {
    en: `${product.name}: ${product.dosage} — apply ${method}, ${product.timing ?? "morning"}.`,
    hi: `${product.name}: ${product.dosage} — ${method} ${product.timing ?? "सुबह"} डालें।`,
    mr: `${product.name}: ${product.dosage} — ${method} ${product.timing ?? "सकाळी"} द्या.`,
    te: `${product.name}: ${product.dosage} — ${method} ${product.timing ?? "ఉదయం"} వేయండి.`,
  };
  return (msg[language] ?? msg["en"]).substring(0, 280);
}

function buildLLMPrompt(languageName, languageCode, evidence) {
  const farmType = normalizeTypeOfFarming(evidence?.typeOfFarming ?? "Integrated");
  const crop = evidence?.cropType ?? "Crop";
  const stage = evidence?.cropGrowthStage ?? "Unknown";
  const bbch = evidence?.bbchStage ?? 0;
  const acre = evidence?.acre ?? 1;
  const sprayDecision = evidence?.decisionHints?.spray;
  const micronutrients = evidence?.decisionHints?.fertigation?.micronutrients ?? [];
  const glossary = LANGUAGE_GLOSSARY[languageCode] ?? {};

  return `You are CropGen — an AI precision agriculture system. You are a senior agronomist, certified crop protection expert, and precision irrigation specialist.

══════════════════════════════════════
🌾 FARM CONTEXT
══════════════════════════════════════
Crop: ${crop}
Stage: ${stage} (BBCH ${bbch})
Area: ${acre} acre
Farming Type: ${farmType}
Irrigation: ${evidence?.irrigationType ?? "Unknown"}

══════════════════════════════════════
📡 SATELLITE + FIELD DATA
══════════════════════════════════════
${JSON.stringify({
  satelliteIndices: evidence?.satelliteOpticalIndices,
  cropHealth: evidence?.cropHealth,
  soilMoisture: evidence?.soilMoisture,
  stressZones: evidence?.stressZones,
  nutrientDeficit: evidence?.nutrientDeficit,
}, null, 2)}

══════════════════════════════════════
🌤️ WEATHER (7-DAY)
══════════════════════════════════════
${JSON.stringify(evidence?.weatherForecast, null, 2)}

══════════════════════════════════════
🌿 DECISION HINTS FROM SYSTEM ENGINE
══════════════════════════════════════
Spray decision: ${JSON.stringify(sprayDecision)}
Irrigation: ${JSON.stringify(evidence?.decisionHints?.irrigation)}
Monitoring: ${JSON.stringify(evidence?.decisionHints?.monitoring)}
Micronutrients detected: ${JSON.stringify(micronutrients)}

══════════════════════════════════════
🧠 ABSOLUTE RULES
══════════════════════════════════════
1. OUTPUT LANGUAGE: ${languageName} ONLY. Every single word in ${languageName}. No English unless language is English. No bilingual mixing.
2. NEVER give generic advice. Always be crop+stage+weather specific.
3. All doses must be area-calculated: per acre AND total for ${acre} acre.
4. Spray: include molecule name, % active ingredient, formulation type (WP/SC/EC/SL), dose in ml or g per litre, total water volume per acre.
5. Fertigation: ONLY water-soluble/liquid products. Never recommend vermicompost or FYM via drip.
6. FARMING TYPE=${farmType}: ${farmType === "Organic" ? "Use ONLY bio-pesticides, liquid organic, bio-stimulants. No synthetic chemicals." : farmType === "Inorganic" ? "Use only chemical/synthetic products." : "Mix organic bio-inputs with mild chemicals. Severe risk = full chemical allowed."}
7. If spray decision hint says shouldSpray=false due to rain/wind, RESPECT it — write skip spray message.
8. WEATHER ADVISORY: mention if temperature is extreme, if rain will impact operations, spray or irrigation timing adjustments.
9. CARBON TRACKING: calculate using biomass, stage, fertilizer input.
10. Do NOT fabricate data not in evidence.

══════════════════════════════════════
📦 OUTPUT FORMAT — STRICT JSON
══════════════════════════════════════
Return ONLY valid JSON. No markdown, no preamble.
SPRAY and FERTIGATION are handled by system — you MUST generate:
WEATHER, CROP_RISK, MONITORING, CARBON_TRACKING

For SPRAY: use sprayDecision hints above to build accurate product details.
For CROP_RISK: use satellite + weather data for accurate risk assessment.

{
  "activitiesToDo": [
    {
      "type": "SPRAY",
      "title": "(in ${languageName})",
      "message": "(in ${languageName} — exact product, dose, timing, water volume)",
      "details": {
        "products": [
          {
            "name": "exact molecule + % + form",
            "category": "CHEMICAL|ORGANIC|BIO",
            "target": "exact disease/pest name",
            "dose": "X ml or g per litre, Y litre water per acre",
            "applicationMethod": "foliar spray",
            "timing": "(in ${languageName})",
            "waterPerAcre": "200 litre"
          }
        ],
        "applicationMethod": "(in ${languageName})",
        "timing": "(in ${languageName})",
        "notes": "(in ${languageName})"
      }
    },
    {
      "type": "WEATHER",
      "title": "(in ${languageName})",
      "message": "(in ${languageName} — field impact, timing recommendations)",
      "details": {
        "temperature": "X°C",
        "humidity": "X%",
        "rainfallProbability": "X%",
        "windSpeed": "X km/h",
        "advisory": "(in ${languageName} — impact on spray, irrigation, field operations)"
      }
    },
    {
      "type": "CROP_RISK",
      "title": "(in ${languageName})",
      "message": "(in ${languageName} — specific risk for this crop at this stage)",
      "details": {
        "riskLevel": "HIGH|MEDIUM|LOW",
        "cause": "(in ${languageName})",
        "recommendedAction": "(in ${languageName})"
      }
    },
    {
      "type": "MONITORING",
      "title": "(in ${languageName})",
      "message": "(in ${languageName} — specific what to check, where, symptoms to look for)",
      "details": {
        "focusAreas": ["(in ${languageName})", "(in ${languageName})"],
        "whatToCheck": "(in ${languageName})",
        "frequency": "(in ${languageName})",
        "alertThreshold": "(in ${languageName})"
      }
    },
    {
      "type": "CARBON_TRACKING",
      "title": "(in ${languageName})",
      "message": "(in ${languageName})",
      "details": {
        "emissionKgCO2e": "number",
        "captureKgCO2e": "number",
        "netBalanceKgCO2e": "number",
        "recommendation": "(in ${languageName})"
      }
    }
  ]
}

Evidence data:
${JSON.stringify(evidence, null, 2)}
`;
}

export async function generateSmartAdvisory({ language = "en", evidence }) {
  const languageName = LANGUAGE_MAP[language] || "English";
  const prompt = buildLLMPrompt(languageName, language, evidence);
  const response = await callOpenAI(prompt);

  if (!response || !Array.isArray(response.activitiesToDo)) {
    console.warn("Advisory LLM returned no usable JSON; skipping AI activities");
    return null;
  }

  return postProcessAdvisory(response, evidence, language, buildFertigationActivityFromHints);
}
