import { Agent } from "@openai/agents";
import { getRunner, resolveModelName } from "./runner.js";

/**
 * Translate the VALUES of a flat { key: "text with {placeholders}" } object.
 * Returns an object with the same keys, or null if translation failed.
 */
export async function translateStrings(strings, languageDescriptor) {
  const runner = getRunner();
  if (!runner) return null;
  const translator = new Agent({
    name: "CropGen notice translator",
    model: resolveModelName(),
    modelSettings: { temperature: 0, maxTokens: 2048 },
    instructions: `You translate short app messages for Indian farmers into ${languageDescriptor}.
Input is a JSON object. Return ONLY a JSON object with exactly the same keys and the translated values.
Rules: keep every {placeholder} exactly as written (do not translate or alter the text inside braces); keep numbers, farm/crop names and brand names (CropGen, Satagro) unchanged; use simple, friendly, respectful wording; no markdown; no explanations.`,
  });
  try {
    const res = await runner.run(translator, JSON.stringify(strings), {
      maxTurns: 1,
      signal: AbortSignal.timeout(30000),
    });
    const raw = String(res.finalOutput || "")
      .trim()
      .replace(/^```(?:json)?/i, "")
      .replace(/```$/, "")
      .trim();
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch (err) {
    console.error("notice translation failed:", err?.message || err);
    return null;
  }
}

/**
 * Translate a whole chat reply into the target language, keeping its line breaks, bullets
 * and any numbers/names. Returns null if it fails.
 */
export async function translateReply(text, languageDescriptor) {
  const runner = getRunner();
  if (!runner || !text) return null;
  const translator = new Agent({
    name: "CropGen reply translator",
    model: resolveModelName(),
    modelSettings: { temperature: 0, maxTokens: 1500 },
    instructions: `Translate the message into ${languageDescriptor}. Keep the same meaning, line breaks and bullet points (•). Keep numbers, units, crop/product/brand names and place names. Do not add or remove information. Plain text only, no markdown. Output only the translation.`,
  });
  try {
    const res = await runner.run(translator, text, {
      maxTurns: 1,
      signal: AbortSignal.timeout(30000),
    });
    const out = String(res.finalOutput || "").trim();
    return out || null;
  } catch (err) {
    console.error("reply translation failed:", err?.message || err);
    return null;
  }
}
