import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function callOpenAI(prompt) {
  try {
    const response = await openai.responses.create({
      model: process.env.OPENAI_MODEL || "gpt-4.1",
      temperature: 0.2,
      max_output_tokens: 1600,
      input: [
        {
          role: "system",
          content:
            "You are a senior agronomist. Respond ONLY with valid JSON exactly matching the schema."
        },
        { role: "user", content: prompt }
      ]
    });

    const content = response.output?.[0]?.content?.[0];

    if (content?.type === "output_json") return content.json;

    if (content?.type === "output_text") {
      let text = content.text || "";

      // Handle cases where the model wraps JSON in ``` or ```json fences
      const fencedMatch = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
      if (fencedMatch) {
        text = fencedMatch[1];
      }

      // Fallback: strip any leading ```json/``` and trailing ``` if present
      text = text.trim();
      if (text.startsWith("```")) {
        text = text.replace(/^```(?:json)?\s*/i, "");
      }
      if (text.endsWith("```")) {
        text = text.replace(/```$/i, "").trim();
      }

      return JSON.parse(text);
    }

    throw new Error("Invalid LLM response");
  } catch (err) {
    console.error("❌ OpenAI Error:", err.message);
    return null;
  }
}
