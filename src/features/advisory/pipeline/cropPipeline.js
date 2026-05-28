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

/**
 * Crop-in-field advisory pipeline (modules 1 → 7).
 * @param {object} params
 * @param {object} params.farmField
 * @param {string} params.geometryId
 * @param {string} params.language
 * @param {string} [params.platform]
 * @param {boolean} [params.lightweight]
 * @param {boolean} [params.preferShortHistoricalWindow]
 */
export async function runCropAdvisoryPipeline({
  farmField,
  geometryId,
  language,
  platform = "whatsapp",
  lightweight = false,
  preferShortHistoricalWindow = false,
}) {
  const fieldIdStr = String(farmField._id);
  const logStep = (message) =>
    console.log(`[Advisory] ${fieldIdStr}: ${message}`);

  const ctx = createAdvisoryContext({
    mode: "crop",
    farmField,
    geometryId,
    language,
    platform,
    lightweight,
    preferShortHistoricalWindow,
    logStep,
  });

  logStep(lightweight ? "pipeline started (fast path)" : "pipeline started");

  const steps = [
    runWeatherSuggestionModule,
    runSatelliteEnrichmentModule,
    runGddBbchModule,
    runSatelliteEnrichmentModule,
    runNpkModule,
    runCropHealthModule,
    runFertilizerRecommendationModule,
    runSprayRecommendationModule,
    runAdvisorySuggestionModule,
  ];

  for (const runModule of steps) {
    const result = await runModule(ctx);
    registerModule(ctx, result);
    if (!result.ok && result.module !== "weatherSuggestion") {
      logStep(`module ${result.module} failed: ${result.errors.join("; ")}`);
    }
    if (result.module === "weatherSuggestion" && !result.ok) {
      throw new Error(result.errors[0] || "Weather module failed");
    }
    if (result.module === "advisorySuggestion" && !result.ok) {
      throw new Error(result.errors[0] || "Advisory module failed");
    }
  }

  const advisory = ctx.modules.advisorySuggestion?.data?.advisory;
  if (!advisory) {
    throw new Error("Advisory pipeline completed without saving an advisory");
  }

  logStep(`pipeline complete — ${advisory._id}`);
  return { advisory, ctx };
}
