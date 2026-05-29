import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** @type {Record<string, Record<string, string>>} */
const MESSAGES_BY_LANG = {};

for (const file of readdirSync(__dirname)) {
  if (!file.endsWith(".json")) continue;
  const code = file.replace(/\.json$/, "");
  MESSAGES_BY_LANG[code] = JSON.parse(readFileSync(join(__dirname, file), "utf8"));
}

function isEnglishStub(code) {
  if (code === "en") return false;
  const en = MESSAGES_BY_LANG.en;
  const specific = MESSAGES_BY_LANG[code];
  if (!en || !specific) return false;
  return JSON.stringify(specific) === JSON.stringify(en);
}

export function getMessageBundle(lang) {
  const en = MESSAGES_BY_LANG.en || {};
  if (lang === "en") return en;
  const specific = MESSAGES_BY_LANG[lang];
  // Ignore locale files that are unchanged copies of en.json (sync script stubs).
  if (!specific || isEnglishStub(lang)) return en;
  return { ...en, ...specific };
}

export function listLoadedMessageLocales() {
  return Object.keys(MESSAGES_BY_LANG).sort();
}
