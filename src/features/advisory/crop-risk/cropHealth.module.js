import { calcCropHealth } from "../../../utils/crop/health/cropHealth.js";
import {
  buildBarrenLandCropHealth,
  buildBarrenLandEvidence,
} from "../utils/agronomy/barrenLand/barrenLandEvidence.js";
import { MODULE_IDS } from "../pipeline/constants.js";
import { moduleResult } from "../pipeline/moduleResult.js";

export async function runCropHealthModule(ctx) {
  const weather = ctx.modules.weatherSuggestion?.data;
  const gdd = ctx.modules.gddBbch?.data;
  const npk = ctx.modules.npk?.data;
  const satellite = ctx.modules.satelliteEnrichment?.data;

  if (!weather?.weatherSummary || !npk?.npkManagement) {
    return moduleResult(MODULE_IDS.CROP_HEALTH, null, {
      errors: ["weather and NPK modules required before crop health"],
    });
  }

  let cropHealth;
  let stressZones = null;

  if (ctx.mode === "barren") {
    const evidence = buildBarrenLandEvidence({
      farmField: ctx.farmFieldDoc,
      weatherSummary: weather.weatherSummary,
      ndvi: satellite?.ndvi,
      water: satellite?.water,
      language: ctx.language,
    });
    cropHealth = buildBarrenLandCropHealth(
      ctx.farmFieldDoc,
      evidence.sowingWindow,
      ctx.language,
    );
    stressZones = evidence.stressZones ?? null;
    ctx.stash.barrenEvidence = evidence;
  } else {
    cropHealth = calcCropHealth({
      ndvi: satellite?.ndvi,
      water: satellite?.water,
      weatherSummary: weather.weatherSummary,
      plantGrowthActivity: gdd?.plantGrowthActivity,
      npkManagement: npk.npkManagement,
      farmField: ctx.farmFieldDoc,
      language: ctx.language,
      opticalIndicesSummary: satellite?.opticalIndicesSummary,
      satelliteHealthSignal: satellite?.cropHealthSignal,
    });
  }

  ctx.logStep(`crop health module: ${cropHealth?.category || "unknown"}`);
  return moduleResult(MODULE_IDS.CROP_HEALTH, { cropHealth, stressZones });
}
