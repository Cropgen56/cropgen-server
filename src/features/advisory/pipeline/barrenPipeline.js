import { createAdvisoryContext } from "./advisoryContext.js";
import { registerModule } from "./moduleResult.js";
import { runWeatherSuggestionModule } from "../water/weatherSuggestion.module.js";
import { runGddBbchModule } from "../growth-stage/gddBbch.module.js";
import { runSatelliteEnrichmentModule } from "../monitoring/satelliteEnrichment.module.js";
import { runNpkModule } from "../npk-calculation/npk.module.js";
import { runCropHealthModule } from "../crop-risk/cropHealth.module.js";
import { runFertilizerRecommendationModule } from "../fertigation-calculation/fertilizerRecommendation.module.js";
import { runSprayRecommendationModule } from "../spray-calculation/sprayRecommendation.module.js";
import { runAdvisorySuggestionModule } from "../activity-todo/advisorySuggestion.module.js";
import { createStepLogger } from "../../../utils/logger.js";

/**
 * Barren land (pre-sowing) advisory pipeline.
 */
export async function runBarrenAdvisoryPipeline({
  farmField,
  geometryId,
  language,
  platform = "whatsapp",
  lightweight = false,
}) {
  const fieldIdStr = String(farmField._id);
  const logStep = createStepLogger(`[Advisory:barren] ${fieldIdStr}:`);

  const ctx = createAdvisoryContext({
    mode: "barren",
    farmField,
    geometryId,
    language,
    platform,
    lightweight,
    logStep,
  });

  logStep("barren pipeline started");

  const steps = [
    runWeatherSuggestionModule,
    runGddBbchModule,
    runSatelliteEnrichmentModule,
    runNpkModule,
    runCropHealthModule,
    runFertilizerRecommendationModule,
    runSprayRecommendationModule,
    runAdvisorySuggestionModule,
  ];

  for (const runModule of steps) {
    const startedAt = Date.now();
    const result = await runModule(ctx);
    registerModule(ctx, result);
    logStep(
      `module ${result.module} done in ${Date.now() - startedAt}ms${result.ok ? "" : " (with warnings/errors)"}`,
    );
    if (result.module === "weatherSuggestion" && !result.ok) {
      throw new Error(result.errors[0] || "Weather unavailable for barren land");
    }
    if (result.module === "advisorySuggestion" && !result.ok) {
      throw new Error(result.errors[0] || "Barren advisory module failed");
    }
  }

  const advisory = ctx.modules.advisorySuggestion?.data?.advisory;
  if (!advisory) {
    throw new Error("Barren pipeline completed without saving an advisory");
  }

  logStep(`pipeline complete — ${advisory._id}`);
  return { advisory, ctx };
}
