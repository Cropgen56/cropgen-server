import { tool } from "@openai/agents";
import { z } from "zod";
import { normalizeStateCode } from "../utils/farmerContext.js";
import KnowledgeRecord, {
  KNOWLEDGE_TOPICS,
} from "../../../models/knowledge-record.model.js";

const MAX_RECORDS = 6;
const STALE_MONTHS = 36;

const norm = (v) => String(v ?? "").trim().toLowerCase();
const isAll = (v) => !norm(v) || norm(v) === "all";
/** "Maharashtra", "MAHARASHTRA" and "MH" must all compare equal. */
const stateKey = (v) => normalizeStateCode(v) || norm(v);

/** Higher = more specific/applicable. Returns -1 when the record does not apply. */
export function scoreRecord(rec, { state, district, growthStage }) {
  let score = 0;
  const rs = rec.region?.state;
  const rd = rec.region?.district;
  const zone = (rec.region?.districts || []).map(norm).filter(Boolean);

  if (zone.length) {
    if (!district || !zone.includes(norm(district))) return -1;
    score += 90;
  }

  if (!isAll(rd)) {
    if (!district || norm(rd) !== norm(district)) return -1;
    score += 100;
  }
  if (!isAll(rs)) {
    if (!state || stateKey(rs) !== stateKey(state)) return -1;
    score += 50;
  }
  if (!isAll(rec.growthStage) && growthStage) {
    // Stage KNOWN: it must match. Stage unknown: keep the record (the agent checks the stage label).
    if (!norm(rec.growthStage).includes(norm(growthStage)) &&
        !norm(growthStage).includes(norm(rec.growthStage))) return -1;
    score += 20;
  }
  score += { high: 3, medium: 2, low: 1 }[rec.confidence] || 0;
  return score;
}

export function rankRecords(records, ctx, limit = MAX_RECORDS) {
  return records
    .map((r) => ({ r, s: scoreRecord(r, ctx) }))
    .filter((x) => x.s >= 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map((x) => x.r);
}

function monthsSince(d) {
  return (Date.now() - new Date(d).getTime()) / (30.44 * 864e5);
}

function shape(rec) {
  return {
    recordId: rec.recordId,
    crop: rec.crop,
    topic: rec.topic,
    region: rec.region,
    growthStage: rec.growthStage,
    recommendation: rec.recommendation,
    conditions: rec.conditions,
    numeric:
      rec.numericValue == null
        ? null
        : {
            value: rec.numericValue,
            ...(rec.numericValueMax != null ? { max: rec.numericValueMax } : {}),
            unit: rec.numericUnit,
            basis: rec.calculationBasis,
          },
    source: rec.source,
    reviewedOn: rec.reviewedOn,
    stale: monthsSince(rec.reviewedOn) > STALE_MONTHS,
    confidence: rec.confidence,
    contraindications: rec.contraindications,
    requiredInputs: rec.requiredInputs,
    reviewNotes: rec.reviewNotes || undefined,
  };
}

/** One compact line per record for the per-turn prompt note. */
export function formatRecordForPrompt(rec) {
  const s = shape(rec);
  const num = s.numeric
    ? ` | number: ${s.numeric.value}${s.numeric.max != null ? "–" + s.numeric.max : ""} ${s.numeric.unit} ${s.numeric.basis}`
    : "";
  const reg = s.region?.districts?.length ? `districts ${s.region.districts.join("/")}` : `${s.region?.state}/${s.region?.district}`;
  return (
    `- ${s.recordId} | ${s.crop} | ${s.topic} | stage: ${s.growthStage} | ${s.recommendation}` +
    `${s.conditions ? " | when: " + s.conditions : ""}${num}` +
    `${s.contraindications ? " | do NOT: " + s.contraindications : ""}` +
    `${s.requiredInputs?.length ? " | needs: " + s.requiredInputs.join(", ") : ""}` +
    ` | region: ${reg} | source: ${s.source.publisher}, ${s.source.yearOrVersion}, ${s.source.pageOrSection}` +
    `${s.stale ? " | STALE (reviewed " + String(s.reviewedOn).slice(0, 4) + ")" : ""}`
  );
}

export const knowledgeRecordTool = tool({
  name: "get_sourced_guidance",
  description:
    "Fetch reviewed, source-cited agronomy records (rates, timings, spacing, thresholds) for a crop, topic, region and growth stage. Call this BEFORE giving any numeric dose, rate, date window or quantity. Pass the farmer's state/district and the crop stage when known.",
  parameters: z.object({
    cropName: z.string().describe("Crop in English, e.g. 'turmeric'."),
    topic: z.enum(KNOWLEDGE_TOPICS),
    state: z.string().nullable().describe("Farmer's state if known, else null."),
    district: z.string().nullable().describe("Farmer's district if known, else null."),
    growthStage: z.string().nullable().describe("Crop stage if known (e.g. 'vegetative'), else null."),
  }),
  async execute({ cropName, topic, state, district, growthStage }) {
    const crop = norm(cropName);
    const candidates = await KnowledgeRecord.find({
      status: "approved",
      topic,
      crop: { $in: [crop, "all"] },
    }).lean();

    const records = rankRecords(candidates, { state, district, growthStage });
    if (!records.length) {
      return JSON.stringify({
        found: false,
        cropName,
        topic,
        note: "No reviewed source for this crop/region/stage. Do NOT state any numeric rate, dose or date. Give the principle or stage window only, and say the local KVK / state agricultural university package of practices should confirm the number. Do not mention a tool or database.",
      });
    }
    return JSON.stringify({
      found: true,
      note: "Cite publisher + year in the Confidence line. Respect conditions, contraindications and requiredInputs; if requiredInputs are missing, ask for them. If stale is true, say the guidance may be outdated.",
      records: records.map(shape),
    });
  },
});
