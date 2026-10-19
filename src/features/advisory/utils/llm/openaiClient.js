import OpenAI from "openai";

let openaiClient = null;

function getClient() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not configured");
  }
  if (!openaiClient) {
    openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return openaiClient;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const OPENAI_TIMEOUT_MS = Number(process.env.OPENAI_TIMEOUT_MS) || 18_000;

function parseResponseContent(response) {
  const content = response.output?.[0]?.content?.[0];

  if (content?.type === "output_json") return content.json;

  if (content?.type === "output_text") {
    let text = content.text || "";
    const fencedMatch = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
    if (fencedMatch) text = fencedMatch[1];
    text = text.trim();
    if (text.startsWith("```")) text = text.replace(/^```(?:json)?\s*/i, "");
    if (text.endsWith("```")) text = text.replace(/```$/i, "").trim();
    return JSON.parse(text);
  }

  throw new Error("Invalid LLM response format");
}

export async function callOpenAI(prompt, { maxAttempts = 2 } = {}) {
  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const attemptStartedAt = Date.now();
      const openai = getClient();
      const response = await Promise.race([
        openai.responses.create({
          model: process.env.OPENAI_MODEL || "gpt-4o-mini",
          temperature: 0.2,
          max_output_tokens: 1600,
          input: [
            {
              role: "system",
              content:
                "You are a senior agronomist with 20 years of field experience in India. Respond ONLY with valid JSON matching the requested schema. Never contradict the decisionHints in the evidence.",
            },
            { role: "user", content: prompt },
          ],
        }),
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error(`OpenAI timeout after ${OPENAI_TIMEOUT_MS}ms`)),
            OPENAI_TIMEOUT_MS,
          ),
        ),
      ]);
      console.log(
        `[Advisory] OpenAI attempt ${attempt}/${maxAttempts} success in ${Date.now() - attemptStartedAt}ms`,
      );
      return parseResponseContent(response);
    } catch (err) {
      lastError = err;
      console.error(
        `[Advisory] OpenAI attempt ${attempt}/${maxAttempts} failed:`,
        err.message,
      );
      if (attempt < maxAttempts) await sleep(1200 * attempt);
    }
  }

  return null;
}
