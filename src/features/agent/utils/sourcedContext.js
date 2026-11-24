import mongoose from "mongoose";
import KnowledgeRecord from "../../../models/knowledge-record.model.js";
import { numbersFromRecord } from "./turnAudit.js";
import { rankRecords, formatRecordForPrompt } from "../tools/knowledgeRecordTool.js";

const TOPIC_WORDS = {
  variety: /variet|type of|which (turmeric|crop|seed)|cultivar/i,
  planting: /plant|sow|seed|spacing|bed|ridge|intercrop/i,
  nutrient: /fertili|manure|nutrient|npk|urea|compost|fym|dose/i,
  irrigation: /irrigat|water|mulch|drip/i,
  weed: /weed|herbicide|glyphosate/i,
  pest: /pest|insect|worm|grub|nematode|caterpillar|borer|fly/i,
  disease: /disease|spot|rot|blight|fung|yellow|blotch|spray/i,
  harvest: /harvest|dig|boil|polish|dry|mature|ready|post-?harvest/i,
  soil: /soil|earth/i,
  weather_risk: /rain|weather|drought|storm|frost|wet/i,
};
const MAX_LINES = 10;

function tokens(text) {
  const w = String(text || "").toLowerCase().match(/[a-z]{3,}/g) || [];
  const out = new Set(w);
  for (let i = 0; i < w.length - 1; i++) out.add(`${w[i]} ${w[i + 1]}`);
  return [...out].slice(0, 60);
}

/**
 * Server-side retrieval: approved, region-matched records for the crops in play,
 * formatted as a note placed before the farmer's message. The model is NOT trusted
 * to call the lookup tool on its own.
 * @returns {{ note: string, recordIds: string[] }}
 */
export async function buildSourcedNote({ text, state, district, cropNames = [], growthStage = null }) {
  if (mongoose.connection.readyState !== 1 && !KnowledgeRecord.find.__stub) return { note: "", recordIds: [], numbers: [] };
  try {
    const crops = [...new Set([...cropNames.map((c) => String(c).toLowerCase().trim()).filter(Boolean), ...tokens(text)])];
    const rows = await KnowledgeRecord.find({ status: "approved", crop: { $in: [...crops, "all"] } }).lean();
    const ranked = rankRecords(rows, { state, district, growthStage }, 60);
    if (!ranked.length) return { note: "", recordIds: [], numbers: [] };

    const wanted = Object.entries(TOPIC_WORDS).filter(([, re]) => re.test(text)).map(([t]) => t);
    const scored = ranked
      .map((r, i) => ({ r, k: (wanted.includes(r.topic) ? 100 : 0) - i }))
      .sort((a, b) => b.k - a.k)
      .slice(0, MAX_LINES)
      .map((x) => x.r);

    const note =
      `\n\n[Reviewed regional guidance (approved records for this farmer's region). Use these FIRST. Cite publisher + year in the Confidence line. ` +
      `Use a record only if its crop stage fits the farmer's crop; respect conditions, contraindications and requiredInputs; if stale, say it may be outdated. ` +
      `Records:\n${scored.map(formatRecordForPrompt).join("\n")}]`;
    return { note, recordIds: scored.map((r) => r.recordId), numbers: [...new Set(scored.flatMap(numbersFromRecord))] };
  } catch (err) {
    console.error("sourced context failed:", err.message);
    return { note: "", recordIds: [], numbers: [] };
  }
}
