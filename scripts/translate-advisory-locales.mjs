#!/usr/bin/env node
/**
 * Translate advisory rule-based strings from en.json into each locale file.
 * Skips en, hi, mr and any file that is already non-English.
 *
 * Usage:
 *   node scripts/translate-advisory-locales.mjs
 *   node scripts/translate-advisory-locales.mjs bn ta gu
 */
import dotenv from "dotenv";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import OpenAI from "openai";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: join(root, ".env") });

const messagesDir = join(root, "src/features/advisory/utils/i18n/messages");
const { ADVISORY_LANGUAGE_CODES, ADVISORY_LANGUAGE_NAMES } = await import(
  join(root, "src/features/advisory/utils/i18n/advisoryLanguages.js"),
);

const SKIP = new Set(["en", "hi", "mr"]);
const en = JSON.parse(readFileSync(join(messagesDir, "en.json"), "utf8"));
const enSerialized = JSON.stringify(en);

function isEnglishStub(bundle) {
  return JSON.stringify(bundle) === enSerialized;
}

function parseJsonResponse(text) {
  let raw = (text || "").trim();
  const fenced = raw.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenced) raw = fenced[1].trim();
  return JSON.parse(raw);
}

async function translateLocale(openai, model, code, source) {
  const languageName = ADVISORY_LANGUAGE_NAMES[code] || code;
  const keys = Object.keys(source);

  const response = await openai.chat.completions.create({
    model,
    temperature: 0.2,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `You translate farmer-facing agricultural advisory UI strings into ${languageName} (${code}).
Return a single JSON object with exactly the same keys as the input.
Rules:
- Use natural ${languageName} for Indian farmers.
- Use the standard native script for ${languageName}.
- Keep placeholders exactly as-is: {crop}, {days}, {temp}, {rain3}, {rain7}, {daysNote}, {reason}, {fertilizer}, {quantity}, {level}, {cause}, {action}, {variety}, {date}.
- Do not add or remove keys.
- No English sentences except product abbreviations (FYM, AI) where commonly used.`,
      },
      {
        role: "user",
        content: JSON.stringify(source, null, 2),
      },
    ],
  });

  const parsed = parseJsonResponse(response.choices[0]?.message?.content);
  const allowedPlaceholders = new Set([
    "crop",
    "days",
    "temp",
    "rain3",
    "rain7",
    "daysNote",
    "reason",
    "fertilizer",
    "quantity",
    "level",
    "cause",
    "action",
    "variety",
    "date",
  ]);

  for (const key of keys) {
    if (typeof parsed[key] !== "string" || !parsed[key].trim()) {
      throw new Error(`Missing or empty translation for key "${key}" (${code})`);
    }
    const bad = [...parsed[key].matchAll(/\{([^}]+)\}/g)]
      .map((m) => m[1])
      .filter((name) => !allowedPlaceholders.has(name));
    if (bad.length) {
      throw new Error(
        `Invalid placeholders in "${key}" (${code}): ${bad.join(", ")}`,
      );
    }
  }
  return parsed;
}

const requested = process.argv.slice(2).filter(Boolean);
const targets = (
  requested.length ? requested : ADVISORY_LANGUAGE_CODES
).filter((code) => !SKIP.has(code));

if (!process.env.OPENAI_API_KEY) {
  console.error("OPENAI_API_KEY is not set in cropgen-server/.env");
  process.exit(1);
}

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

let ok = 0;
let skipped = 0;
let failed = 0;

for (const code of targets) {
  if (!ADVISORY_LANGUAGE_CODES.includes(code)) {
    console.warn(`Unknown language code: ${code}`);
    failed++;
    continue;
  }

  const path = join(messagesDir, `${code}.json`);
  if (existsSync(path)) {
    const existing = JSON.parse(readFileSync(path, "utf8"));
    if (!isEnglishStub(existing)) {
      console.log(`skip ${code} (already translated)`);
      skipped++;
      continue;
    }
  }

  try {
    console.log(`translating ${code} (${ADVISORY_LANGUAGE_NAMES[code]})...`);
    const translated = await translateLocale(openai, model, code, en);
    writeFileSync(path, `${JSON.stringify(translated, null, 2)}\n`);
    console.log(`  wrote ${code}.json`);
    ok++;
    await new Promise((r) => setTimeout(r, 400));
  } catch (err) {
    console.error(`  failed ${code}:`, err.message);
    failed++;
  }
}

console.log(`Done. translated=${ok} skipped=${skipped} failed=${failed}`);
