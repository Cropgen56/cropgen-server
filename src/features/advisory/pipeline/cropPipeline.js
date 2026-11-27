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
 * Fetch optical indices (NDRE, nitrogen, chlorophyll…) BEFORE crop health and
 * the decision modules so they are actually used. Skipped on the lightweight
 * first-advisory path to keep it fast (that path still defers them).
 */
const OPTICAL_BEFORE_DECISIONS =
  String(process.env.ADVISORY_OPTICAL_BEFORE_DECISIONS || "true").toLowerCase() ===
  "true";

/** Second satellite pass (optical indices); runs only after GDD has a stage. */
async function runOpticalPassModule(ctx) {
  const result = await runSatelliteEnrichmentModule(ctx);
  ctx.stash.opticalDone = Boolean(result?.data?.opticalIndicesSummary);
  return result;
}

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
 * @param {boolean} [params.notify]
 */
export async function runCropAdvisoryPipeline({
  farmField,
  cropInstance = null,
  geometryId,
  language,
  platform = "whatsapp",
  lightweight = false,
  preferShortHistoricalWindow = false,
  notify = true,
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
    notify,
    logStep,
  });

  logStep(lightweight ? "pipeline started (fast path)" : "pipeline started");

  const mustHaveSteps = [
    runWeatherSuggestionModule,
    runSatelliteEnrichmentModule,
    runGddBbchModule,
    ...(OPTICAL_BEFORE_DECISIONS && !lightweight ? [runOpticalPassModule] : []),
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
      // No weather (ObservEarth down, AOI missing, etc.): continue without it.
      // The advisory is generated from the other modules and is marked as weather-less.
      logStep(`weather unavailable, generating without weather: ${result.errors[0] || "no data"}`);
    }
    if (result.module === "advisorySuggestion" && !result.ok) {
      throw new Error(result.errors[0] || "Advisory module failed");
    }
  }

  const advisory = ctx.modules.advisorySuggestion?.data?.advisory;
  if (!advisory) {
    throw new Error("Advisory pipeline completed without saving an advisory");
  }

  if (ctx.stash.opticalDone) {
    logStep("optical indices already used in decisions");
  } else if (!DEFER_OPTICAL_PASS) {
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
