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
// Read at call time: this module can load before dotenv populates process.env.
const getTimeoutMs = () => Number(process.env.OPENAI_TIMEOUT_MS) || 18_000;

function isTimeoutError(err) {
  return (
    err?.name === "APIConnectionTimeoutError" ||
    /timed? ?out/i.test(err?.message || "")
  );
}

/** Test helper */
export function __setOpenAIClientForTests(client) {
  openaiClient = client;
}

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
      const timeoutMs = getTimeoutMs();
      const openai = getClient();
      // Pass the timeout to the SDK so a timed-out request is actually aborted
      // (a Promise.race timer left it running and billed). SDK retries are off:
      // this loop owns retries.
      const response = await openai.responses.create(
        {
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
        },
        { timeout: timeoutMs, maxRetries: 0 },
      );
      console.log(
        `[Advisory] OpenAI attempt ${attempt}/${maxAttempts} success in ${Date.now() - attemptStartedAt}ms`,
      );
      return parseResponseContent(response);
    } catch (err) {
      lastError = err;
      console.error(
        `[Advisory] OpenAI attempt ${attempt}/${maxAttempts} failed:`,
        isTimeoutError(err)
          ? `OpenAI timeout after ${getTimeoutMs()}ms`
          : err.message,
      );
      if (attempt < maxAttempts) await sleep(1200 * attempt);
    }
  }

  return null;
}
