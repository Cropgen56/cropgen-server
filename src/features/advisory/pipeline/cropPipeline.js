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
import FarmAdvisory from "../models/farmAdvisory.model.js";

const DEFER_OPTICAL_PASS =
  String(process.env.ADVISORY_DEFER_OPTICAL_PASS || "true").toLowerCase() ===
  "true";

/**
 * Crop-in-field advisory pipeline (modules 1 → 7). Runs once per crop
 * instance — pass `cropInstance` (a FieldCrop doc) to advise a specific
 * crop on a multi-crop farm; omitted, it falls back to the farm's own
 * legacy flat cropName/variety/sowingDate fields (pre-multi-crop behavior).
 * @param {object} params
 * @param {object} params.farmField
 * @param {object} [params.cropInstance]
 * @param {string} params.geometryId
 * @param {string} params.language
 * @param {string} [params.platform]
 * @param {boolean} [params.lightweight]
 * @param {boolean} [params.preferShortHistoricalWindow]
 */
export async function runCropAdvisoryPipeline({
  farmField,
  cropInstance = null,
  geometryId,
  language,
  platform = "whatsapp",
  lightweight = false,
  preferShortHistoricalWindow = false,
}) {
  const fieldIdStr = String(farmField._id);
  const logSuffix = cropInstance?.cropName ? `/${cropInstance.cropName}` : "";
  const logStep = createStepLogger(`[Advisory] ${fieldIdStr}${logSuffix}:`);

  const ctx = createAdvisoryContext({
    mode: "crop",
    farmField,
    cropInstance,
    geometryId,
    language,
    platform,
    lightweight,
    preferShortHistoricalWindow,
    logStep,
  });

  logStep(lightweight ? "pipeline started (fast path)" : "pipeline started");

  const mustHaveSteps = [
    runWeatherSuggestionModule,
    runSatelliteEnrichmentModule,
    runGddBbchModule,
    runNpkModule,
    runCropHealthModule,
    runFertilizerRecommendationModule,
    runSprayRecommendationModule,
    runAdvisorySuggestionModule,
  ];

  for (const runModule of mustHaveSteps) {
    const startedAt = Date.now();
    const result = await runModule(ctx);
    registerModule(ctx, result);
    logStep(
      `module ${result.module} done in ${Date.now() - startedAt}ms${result.ok ? "" : " (with warnings/errors)"}`,
    );
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

  if (!DEFER_OPTICAL_PASS) {
    const startedAt = Date.now();
    const secondSatellitePass = await runSatelliteEnrichmentModule(ctx);
    registerModule(ctx, secondSatellitePass);
    logStep(
      `module ${secondSatellitePass.module}(optical) done in ${Date.now() - startedAt}ms`,
    );
  } else {
    setImmediate(async () => {
      try {
        const opticalResult = await runSatelliteEnrichmentModule(ctx);
        if (!opticalResult?.ok) return;
        const opticalSummary = opticalResult?.data?.opticalIndicesSummary;
        if (!opticalSummary) return;
        await FarmAdvisory.findByIdAndUpdate(advisory._id, {
          opticalIndicesSummary: opticalSummary,
        });
        logStep("optical enrichment deferred update complete");
      } catch (err) {
        logStep(`optical enrichment deferred update failed: ${err?.message || err}`);
      }
    });
  }

  logStep(`pipeline complete — ${advisory._id}`);
  return { advisory, ctx };
}
