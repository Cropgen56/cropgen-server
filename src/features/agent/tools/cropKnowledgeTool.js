import { tool } from "@openai/agents";
import { z } from "zod";
import Crop from "../../../models/crop.model.js";

const MAX_SUGGESTIONS = 5;

const TOPICS = [
  "pests",
  "diseases",
  "pests_and_diseases",
  "cultivation",
  "fertilizer",
  "varieties",
  "overview",
];

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function nameCandidates(raw) {
  const n = raw.toLowerCase().trim().replace(/\s+/g, " ");
  const out = new Set([n]);
  if (n.endsWith("es")) out.add(n.slice(0, -2));
  if (n.endsWith("s")) out.add(n.slice(0, -1));
  else out.add(`${n}s`);
  return [...out].filter(Boolean);
}

/**
 * Find a crop by name: exact (incl. simple plural/singular), then partial match.
 * @returns {Promise<{ crop: object|null, suggestions: string[] }>}
 */
export async function findCropByName(rawName) {
  const name = String(rawName || "").trim();
  if (!name) return { crop: null, suggestions: [] };

  const candidates = nameCandidates(name);
  const exact = await Crop.findOne({ cropName: { $in: candidates } }).lean();
  if (exact) return { crop: exact, suggestions: [] };

  const pattern = new RegExp(escapeRegex(candidates[0]), "i");
  const partial = await Crop.find({ cropName: pattern })
    .select("cropName")
    .limit(MAX_SUGGESTIONS + 1)
    .lean();

  if (partial.length === 1) {
    const crop = await Crop.findById(partial[0]._id).lean();
    return { crop, suggestions: [] };
  }

  return {
    crop: null,
    suggestions: partial.slice(0, MAX_SUGGESTIONS).map((c) => c.cropName),
  };
}

function compactControl(cm = {}) {
  return {
    organic: {
      preventive: cm.organic?.preventive || [],
      curative: cm.organic?.curative || [],
    },
    chemical: {
      preventive: cm.inorganic?.preventive || [],
      curative: cm.inorganic?.curative || [],
    },
  };
}

function compactProtection(list, nameKey) {
  return (list || []).map((p) => ({
    name: p[nameKey],
    symptoms: p.symptoms,
    control: compactControl(p.controlMethods),
  }));
}

/** Shape only the requested section so the tool output stays small. */
export function buildCropKnowledge(crop, topic) {
  const base = { crop: crop.cropName };

  switch (topic) {
    case "pests":
      return { ...base, pests: compactProtection(crop.pestProtection, "pest") };
    case "diseases":
      return {
        ...base,
        diseases: compactProtection(crop.diseaseProtection, "disease"),
      };
    case "pests_and_diseases":
      return {
        ...base,
        pests: compactProtection(crop.pestProtection, "pest"),
        diseases: compactProtection(crop.diseaseProtection, "disease"),
      };
    case "cultivation":
      return {
        ...base,
        landPreparation: crop.landPreparation,
        nursery: crop.nursery,
        sowing: crop.sowing,
        seed: crop.seed,
        irrigation: crop.irrigation,
        weedControl: crop.weedControl,
        harvesting: crop.harvesting,
        postHarvesting: crop.postHarvesting,
      };
    case "fertilizer":
      return { ...base, fertilizer: crop.fertilizer };
    case "varieties":
      return { ...base, varieties: crop.variety || [] };
    case "overview":
    default:
      return {
        ...base,
        generalInfo: crop.generalInfo,
        climate: crop.climate,
        soil: crop.soil,
        varieties: (crop.variety || []).map((v) => v.name),
        pests: (crop.pestProtection || []).map((p) => p.pest),
        diseases: (crop.diseaseProtection || []).map((d) => d.disease),
      };
  }
}

export const cropKnowledgeTool = tool({
  name: "get_crop_knowledge",
  description:
    "Look up CropGen's verified crop encyclopedia. Use it whenever the farmer asks about pests, diseases, symptoms, control/spray options, varieties, sowing, seed rate, fertilizer doses, irrigation, weed control or harvesting for a specific crop. Returns the stored data for one crop and one topic.",
  parameters: z.object({
    cropName: z
      .string()
      .describe("Crop name in English, e.g. 'tomato', 'wheat', 'pomegranate'."),
    topic: z
      .enum(TOPICS)
      .describe(
        "Which section to fetch. Use pests_and_diseases when the farmer describes a symptom without knowing the cause.",
      ),
  }),
  async execute({ cropName, topic }) {
    const { crop, suggestions } = await findCropByName(cropName);
    if (!crop) {
      return JSON.stringify({
        found: false,
        cropName,
        suggestions,
        note: "No stored data for this crop. If suggestions are listed, ask which one the farmer means; otherwise answer from general agronomy. Do not mention an encyclopedia, tool or database.",
      });
    }
    return JSON.stringify({ found: true, ...buildCropKnowledge(crop, topic) });
  },
});
