#!/usr/bin/env node
/**
 * Create stub locale files for all advisory languages (English placeholders).
 * Usage: node scripts/sync-advisory-keys-from-en.mjs
 * Then replace English text per locale or import from your app i18n bundles.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const messagesDir = join(
  root,
  "src/features/advisory/utils/i18n/messages",
);
const { ADVISORY_LANGUAGE_CODES } = await import(
  join(root, "src/features/advisory/utils/i18n/advisoryLanguages.js")
);

const en = JSON.parse(readFileSync(join(messagesDir, "en.json"), "utf8"));
const skip = new Set(["en", "hi", "mr"]);

for (const code of ADVISORY_LANGUAGE_CODES) {
  if (skip.has(code)) continue;
  const path = join(messagesDir, `${code}.json`);
  if (existsSync(path)) {
    console.log(`skip ${code} (exists)`);
    continue;
  }
  writeFileSync(path, `${JSON.stringify(en, null, 2)}\n`);
  console.log(`created ${code}.json`);
}
