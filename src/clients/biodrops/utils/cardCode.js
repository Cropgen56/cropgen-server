import crypto from "crypto";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function normalizeCardCode(code) {
  return String(code || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
}

export function hashCardCode(code) {
  const normalized = normalizeCardCode(code);
  return crypto.createHash("sha256").update(normalized).digest("hex");
}

export function cardCodePrefix(code) {
  const normalized = normalizeCardCode(code);
  if (normalized.length <= 4) return normalized;
  return `${normalized.slice(0, 2)}****${normalized.slice(-4)}`;
}

function randomChunk(length) {
  let out = "";
  for (let i = 0; i < length; i++) {
    const idx = crypto.randomInt(0, CODE_ALPHABET.length);
    out += CODE_ALPHABET[idx];
  }
  return out;
}

export function generateCardCode() {
  return `BD-${randomChunk(4)}-${randomChunk(4)}`;
}
