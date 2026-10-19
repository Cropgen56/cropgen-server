import { getSprayDecision } from "./sprayDecision.js";
import { buildEvidencePayloadFromContext } from "../pipeline/buildEvidencePayloadFromContext.js";
import { MODULE_IDS } from "../pipeline/constants.js";
import { moduleResult } from "../pipeline/moduleResult.js";

export async function runSprayRecommendationModule(ctx) {
  if (ctx.mode === "barren") {
    const evidence = ctx.stash.barrenEvidence;
    const sprayRecommendation = evidence?.decisionHints?.spray ?? {
      shouldSpray: false,
      reason:
        "Pre-sowing field - chemical spray not recommended before crop establishment.",
      hint: null,
    };
    return moduleResult(MODULE_IDS.SPRAY, { sprayRecommendation });
  }

  try {
    const rawEvidence =
      ctx.stash.rawEvidence ?? buildEvidencePayloadFromContext(ctx).rawEvidence;

    const sprayRecommendation = getSprayDecision(rawEvidence);

    ctx.logStep(
      `spray module: shouldSpray=${Boolean(sprayRecommendation?.shouldSpray)}`,
    );

    return moduleResult(MODULE_IDS.SPRAY, { sprayRecommendation });
  } catch (err) {
    return moduleResult(MODULE_IDS.SPRAY, null, {
      errors: [err?.message || String(err)],
    });
  }
}
