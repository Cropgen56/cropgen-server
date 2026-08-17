import OpenAI from "openai";
import {
  getFarmerLanguagePromptDescriptor,
  normalizeFarmerLanguage,
} from "../../utils/language/farmerLanguages.js";

let openaiClient = null;

function getOpenAIClient() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not configured");
  }
  if (!openaiClient) {
    openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return openaiClient;
}

function parseRecommendationsText(response) {
  const chunks = [];
  for (const outputItem of response?.output || []) {
    for (const content of outputItem?.content || []) {
      if (content?.type === "output_text" && content?.text) {
        chunks.push(String(content.text));
      }
    }
  }

  const text = chunks.join("\n").trim();
  if (!text) return [];

  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^\d+[\).\s-]*/, ""))
    .filter(Boolean)
    .slice(0, 12);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function parseJsonObjectFromResponse(response) {
  const chunks = [];
  for (const outputItem of response?.output || []) {
    for (const content of outputItem?.content || []) {
      if (content?.type === "output_text" && content?.text) {
        chunks.push(String(content.text));
      }
      if (content?.type === "output_json" && content?.json) {
        return content.json;
      }
    }
  }
  let text = chunks.join("\n").trim();
  if (!text) return null;
  const fencedMatch = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fencedMatch) text = fencedMatch[1];
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function hasIndicScript(text) {
  // Covers Devanagari and other major Indic blocks used by supported languages.
  return /[\u0900-\u097F\u0980-\u09FF\u0A00-\u0A7F\u0A80-\u0AFF\u0B00-\u0B7F\u0B80-\u0BFF\u0C00-\u0C7F\u0C80-\u0CFF\u0D00-\u0D7F]/.test(
    text,
  );
}

function isLikelyMixedLanguage(lines, languageCode) {
  if (languageCode === "en") return false;
  if (!lines.length) return true;

  // If most lines have no Indic script, treat as mixed/incorrect language output.
  const indicCount = lines.filter((line) => hasIndicScript(line)).length;
  return indicCount < Math.ceil(lines.length * 0.7);
}

async function rewriteRecommendationsInLanguage({
  openai,
  lines,
  languageDescriptor,
  normalizedLanguage,
}) {
  const rewritePrompt = `
Rewrite the following agronomy recommendation lines into ${languageDescriptor} (code: ${normalizedLanguage}).

IMPORTANT:
- Every line must be in ${languageDescriptor}.
- Keep product brand names and chemical names in Latin script only where necessary (Urea, DAP, SSP, MOP, Zinc Sulphate, Borax, Bokashi).
- Keep units in standard notation (kg/ha, kg/acre, %, ppm).
- Do not add headings, numbering, markdown, or extra explanation.
- Return only one recommendation per line.

Lines:
${lines.join("\n")}
`;

  const response = await openai.responses.create({
    model: process.env.OPENAI_MODEL || "gpt-4o-mini",
    temperature: 0.1,
    max_output_tokens: 900,
    input: [
      {
        role: "system",
        content:
          "You are a strict translation-and-localization expert for Indian agriculture advisories.",
      },
      { role: "user", content: rewritePrompt },
    ],
  });

  return parseRecommendationsText(response);
}

export async function localizeOrganizationSuggestions({
  title,
  notes,
  language = "en",
}) {
  const normalizedLanguage = normalizeFarmerLanguage(language);
  if (normalizedLanguage === "en") {
    return { title, notes };
  }

  const openai = getOpenAIClient();
  const languageDescriptor = getFarmerLanguagePromptDescriptor(normalizedLanguage);

  const prompt = `
Translate the following organization suggestion content into ${languageDescriptor} (code: ${normalizedLanguage}).

Return STRICT JSON only:
{
  "title": "translated title",
  "notes": ["translated line 1", "translated line 2"]
}

Rules:
1) Keep product brand names, chemical names, and units in Latin script when needed (Biodrops, Bokashi, kg/acre, ml/L).
2) Keep all explanatory text in ${languageDescriptor}.
3) Preserve note count and meaning.

Input title:
${title}

Input notes:
${JSON.stringify(notes, null, 2)}
`;

  const response = await openai.responses.create({
    model: process.env.OPENAI_MODEL || "gpt-4o-mini",
    temperature: 0.1,
    max_output_tokens: 800,
    input: [
      {
        role: "system",
        content:
          "You are a strict translator for Indian agriculture advisories. Return valid JSON only.",
      },
      { role: "user", content: prompt },
    ],
  });

  const parsed = parseJsonObjectFromResponse(response);
  const localizedTitle = String(parsed?.title || "").trim();
  const localizedNotes = Array.isArray(parsed?.notes)
    ? parsed.notes.map((n) => String(n || "").trim()).filter(Boolean)
    : [];

  if (!localizedTitle || !localizedNotes.length) {
    return { title, notes };
  }

  return {
    title: localizedTitle,
    notes: localizedNotes,
  };
}

export async function generateLlmSoilRecommendations({
  cropName,
  previousCrop,
  areaAcres,
  areaHectares,
  areaSquareMeters,
  metrics,
  organizationCode,
  language = "en",
}) {
  const openai = getOpenAIClient();
  const normalizedLanguage = normalizeFarmerLanguage(language);
  const languageDescriptor = getFarmerLanguagePromptDescriptor(normalizedLanguage);
  const normalizedOrgCode = String(organizationCode || "CROPGEN").toUpperCase();
  const isBiodropsOrg = normalizedOrgCode === "BIODROPS";
  const bokashiRule = isBiodropsOrg
    ? "4) Include one Bokashi-related soil application line."
    : "4) Do not mention Bokashi, Biodrops, or Satagro products.";
  const prompt = `
Generate a practical fertilizer and micronutrient soil plan for an Indian farm.

Return ONLY short plain-text recommendation lines (one line per recommendation, no markdown, no headings).

Context:
- Current crop: ${cropName}
- Previous crop: ${previousCrop}
- Field area (square meters): ${areaSquareMeters}
- Field area (hectares): ${areaHectares}
- Area (acres): ${areaAcres}
- Organization code: ${normalizedOrgCode}
- Farmer preferred language: ${languageDescriptor} (code: ${normalizedLanguage})

Soil metrics:
${JSON.stringify(metrics, null, 2)}

Rules:
1) Mention exact product names where relevant: Urea, DAP, SSP, MOP, Ammonium Sulphate, Zinc Sulphate, Borax, 20-20-0-13.
2) Include quantity guidance in kg/ha (and optionally practical split guidance).
2b) For EVERY fertilizer/nutrient recommendation, also include total quantity for THIS FIELD area (${areaHectares} ha / ${areaAcres} acres). Do not give generic-only doses.
3) Keep language simple and actionable for farmers.
${bokashiRule}
5) Keep output to 6-10 lines.
6) Write ALL recommendations in ${languageDescriptor}. Keep brand names like Urea, DAP, Bokashi in Latin script if needed.
`;

  const maxAttempts = 2;
  let lastError = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await openai.responses.create({
        model: process.env.OPENAI_MODEL || "gpt-4o-mini",
        temperature: 0.2,
        max_output_tokens: 900,
        input: [
          {
            role: "system",
            content:
              "You are an expert agronomist for Indian crops. Provide concise, practical, safe recommendations.",
          },
          { role: "user", content: prompt },
        ],
      });
      let lines = parseRecommendationsText(response);
      if (!lines.length) {
        throw new Error("Empty LLM recommendation output");
      }

      if (isLikelyMixedLanguage(lines, normalizedLanguage)) {
        const rewritten = await rewriteRecommendationsInLanguage({
          openai,
          lines,
          languageDescriptor,
          normalizedLanguage,
        });
        if (rewritten.length) {
          lines = rewritten;
        }
      }

      if (isLikelyMixedLanguage(lines, normalizedLanguage)) {
        throw new Error(
          `LLM output is not fully in requested language (${normalizedLanguage})`,
        );
      }

      return lines;
    } catch (err) {
      lastError = err;
      if (attempt < maxAttempts) {
        await sleep(900 * attempt);
      }
    }
  }
  throw lastError || new Error("Failed to generate LLM recommendations");
}
