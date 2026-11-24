import { OpenAIProvider, Runner } from "@openai/agents";

let runner = null;

/** One shared Runner backed by the OpenAI Agents SDK provider (null if no API key). */
export function getRunner() {
  const openaiKey = String(process.env.OPENAI_API_KEY ?? "").trim();
  if (!openaiKey) return null;
  if (!runner) {
    runner = new Runner({
      modelProvider: new OpenAIProvider({ apiKey: openaiKey }),
      workflowName: "CropGen farm assistant",
    });
  }
  return runner;
}

export function resolveModelName() {
  return (
    process.env.OPENAI_AGENT_MODEL ||
    process.env.OPENAI_MODEL ||
    "gpt-4o-mini"
  );
}
