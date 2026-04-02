export function normalizeSmartAdvisory(llmOutput) {
  if (!llmOutput?.smartAdvisory) {
    throw new Error("Invalid advisory from LLM");
  }
  return llmOutput;
}
