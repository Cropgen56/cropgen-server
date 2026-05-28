import { getFertigationDecision } from "./fertigationDecision.js";
import { buildEvidencePayloadFromContext } from "../pipeline/buildEvidencePayloadFromContext.js";
import { MODULE_IDS } from "../pipeline/constants.js";
import { moduleResult } from "../pipeline/moduleResult.js";

export async function runFertilizerRecommendationModule(ctx) {
  if (ctx.mode === "barren") {
    const evidence = ctx.stash.barrenEvidence;
    const fertigation = evidence?.decisionHints?.fertigation ?? {
      shouldFertigate: false,
      reason: "Pre-sowing - basal nutrients per soil prep plan.",
      products: [],
      hint: null,
    };
    return moduleResult(MODULE_IDS.FERTILIZER, {
      fertilizerSchedule: evidence?.fertilizerSchedule ?? null,
      fertilizerRecommendation: fertigation,
      nutrientDeficit: evidence?.nutrientDeficit ?? null,
    });
  }

  try {
    const { rawEvidence } = buildEvidencePayloadFromContext(ctx);
    ctx.stash.rawEvidence = rawEvidence;
    ctx.stash.isHarvestStage =
      (rawEvidence.cropGrowthStage ?? "")
        .toLowerCase()
        .match(/maturity|harvest/) != null || (rawEvidence.bbchStage ?? 0) >= 85;

    const fertilizerRecommendation = getFertigationDecision(rawEvidence);

    ctx.logStep(
      `fertilizer module: shouldFertigate=${Boolean(fertilizerRecommendation?.shouldFertigate)}`,
    );

    return moduleResult(MODULE_IDS.FERTILIZER, {
      fertilizerSchedule: rawEvidence.fertilizerSchedule,
      fertilizerRecommendation,
      nutrientDeficit: rawEvidence.nutrientDeficit,
      irrigationRequirement: rawEvidence.irrigationRequirement,
      carbonData: rawEvidence.carbonData,
    });
  } catch (err) {
    return moduleResult(MODULE_IDS.FERTILIZER, null, {
      errors: [err?.message || String(err)],
    });
  }
}
