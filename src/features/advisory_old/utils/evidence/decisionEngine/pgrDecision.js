import { normalizeTypeOfFarming } from "../../shared/farmingTypeNormalize.js";

function normalizeCropName(name) {
  return name?.toLowerCase().replace(/[^a-z0-9]/g, "") ?? "";
}

const PGR_RULES = [
  {
    crops: ["cotton"],
    stageMatch: ["Vegetative", "Stem Elongation", "square"],
    bbchRange: [40, 59],
    pgr: "Mepiquat Chloride",
    formulation: "5% SL",
    reason: "Cotton square stage - controls vegetative growth",
  },
  {
    crops: ["chilli"],
    stageMatch: ["Flowering"],
    bbchRange: [60, 69],
    pgr: "NAA",
    formulation: "4.5% SL",
    reason: "Chilli flowering - improves fruit set",
  },
  {
    crops: ["banana"],
    stageMatch: ["Fruit Development", "Flower Initiation", "bunch"],
    bbchRange: [60, 79],
    pgr: "GA3",
    formulation: "0.001% solution",
    reason: "Banana bunch stage - improves bunch development",
  },
];

export function getPGRDecision(evidence) {
  if (normalizeTypeOfFarming(evidence?.typeOfFarming) === "Organic") {
    return {
      shouldApplyPGR: false,
      reason: "Organic farm - no chemical PGR. Use organic practices only.",
      hint: null,
    };
  }

  const cropType = normalizeCropName(evidence?.cropType ?? "");
  const cropStage = evidence?.cropGrowthStage ?? "";
  const bbchStage = evidence?.bbchStage ?? 0;
  for (const rule of PGR_RULES) {
    const cropMatches = rule.crops.some((c) => cropType.includes(c));
    const stageMatches =
      rule.stageMatch.some((s) => cropStage?.toLowerCase?.().includes(s?.toLowerCase?.())) ||
      (bbchStage >= rule.bbchRange[0] && bbchStage <= rule.bbchRange[1]);

    if (cropMatches && stageMatches) {
      return {
        shouldApplyPGR: true,
        hint: {
          pgr: rule.pgr,
          formulation: rule.formulation,
          reason: rule.reason,
          quantity: "As per product label",
          timing: "Apply during recommended crop stage",
        },
      };
    }
  }

  return {
    shouldApplyPGR: false,
    reason: "No PGR required for current crop and stage.",
    hint: null,
  };
}
