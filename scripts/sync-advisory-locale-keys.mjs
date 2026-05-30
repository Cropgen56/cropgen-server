/**
 * Fill missing advisory locale keys (same keys as en.json) for all 23 languages.
 * Uses OpenAI when OPENAI_API_KEY is set; otherwise copies English as placeholder.
 *
 * Usage: node scripts/sync-advisory-locale-keys.mjs [--dry-run] [--lang=mr,te]
 */

import "dotenv/config";
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import OpenAI from "openai";
import {
  ADVISORY_LANGUAGE_CODES,
  ADVISORY_LANGUAGE_NAMES,
  getAdvisoryScriptNote,
} from "../src/features/advisory/utils/i18n/advisoryLanguages.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MESSAGES_DIR = join(__dirname, "../src/features/advisory/utils/i18n/messages");

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const langFilter = args
  .find((a) => a.startsWith("--lang="))
  ?.slice("--lang=".length)
  .split(",")
  .filter(Boolean);

const en = JSON.parse(readFileSync(join(MESSAGES_DIR, "en.json"), "utf8"));
const enKeys = Object.keys(en);

function missingKeys(localeData) {
  return enKeys.filter((key) => {
    const value = localeData[key];
    return value == null || value === "" || value === en[key];
  });
}

async function translateKeys(languageCode, entries) {
  if (!process.env.OPENAI_API_KEY) {
    console.warn(`  [${languageCode}] OPENAI_API_KEY missing — keeping English for ${entries.length} keys`);
    return Object.fromEntries(entries.map(([k, v]) => [k, v]));
  }

  const languageName = ADVISORY_LANGUAGE_NAMES[languageCode] || languageCode;
  const scriptNote = getAdvisoryScriptNote(languageCode);
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const prompt = `Translate these farmer-facing crop advisory UI strings into ${languageName} (${languageCode}).
${scriptNote}
Rules:
- Return ONLY valid JSON object with the same keys.
- Keep placeholders like {cropName}, {stageName}, {hours}, {temp} unchanged.
- Keep units (kg, CO₂, °C, mm, %) and product names (Urea, DAP, MOP, FYM) as-is where standard.
- Use natural, simple language for farmers.
- Do NOT leave any value in English except allowed tokens above.

Input JSON:
${JSON.stringify(Object.fromEntries(entries), null, 2)}`;

  const response = await openai.responses.create({
    model: process.env.OPENAI_MODEL || "gpt-4o-mini",
    temperature: 0.2,
    max_output_tokens: 4000,
    input: [
      {
        role: "system",
        content:
          "You are a professional agricultural translator for Indian languages. Respond ONLY with valid JSON.",
      },
      { role: "user", content: prompt },
    ],
  });

  const content = response.output?.[0]?.content?.[0];
  if (content?.type === "output_json") return content.json;
  if (content?.type === "output_text") {
    let text = content.text.trim();
    const fenced = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
    if (fenced) text = fenced[1];
    return JSON.parse(text);
  }
  throw new Error("Invalid OpenAI response");
}

async function main() {
  const targets = langFilter?.length
    ? langFilter.filter((c) => c !== "en" && ADVISORY_LANGUAGE_CODES.includes(c))
    : ADVISORY_LANGUAGE_CODES.filter((c) => c !== "en");

  for (const code of targets) {
    const path = join(MESSAGES_DIR, `${code}.json`);
    let locale = {};
    try {
      locale = JSON.parse(readFileSync(path, "utf8"));
    } catch {
      console.warn(`  [${code}] file missing — creating from en.json shell`);
      locale = {};
    }

    const missing = missingKeys(locale);
    if (!missing.length) {
      console.log(`[${code}] up to date (${Object.keys(locale).length} keys)`);
      continue;
    }

    console.log(`[${code}] translating ${missing.length} missing keys...`);
    const entries = missing.map((key) => [key, en[key]]);
    const translated = await translateKeys(code, entries);

    for (const key of missing) {
      if (translated[key]) locale[key] = translated[key];
    }

    if (!dryRun) {
      writeFileSync(path, `${JSON.stringify(locale, null, 2)}\n`, "utf8");
    }
    console.log(`  [${code}] wrote ${missing.length} keys${dryRun ? " (dry-run)" : ""}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
