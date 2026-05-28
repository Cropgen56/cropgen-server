import { resolveHybridCropStage } from "../cropGrowthStage/index.js";
import { buildBarrenLandPlantGrowth } from "../utils/agronomy/barrenLand/barrenLandEvidence.js";
import { MODULE_IDS } from "../pipeline/constants.js";
import { moduleResult } from "../pipeline/moduleResult.js";

export async function runGddBbchModule(ctx) {
  const weather = ctx.modules.weatherSuggestion?.data;
  if (!weather?.weatherSummary) {
    return moduleResult(MODULE_IDS.GDD_BBCH, null, {
      errors: ["weather module required before GDD"],
    });
  }

  if (ctx.mode === "barren") {
    const plantGrowthActivity = buildBarrenLandPlantGrowth(
      ctx.farmFieldDoc,
      ctx.sowingDateISO,
      ctx.language,
    );
    ctx.logStep("GDD module (barren): pre-sowing growth phase");
    return moduleResult(MODULE_IDS.GDD_BBCH, {
      plantGrowthActivity,
      cumulativeGDD: 0,
      cropAgeDays: 0,
      gddSource: "barren_pre_sowing",
    });
  }

  const satellite = ctx.modules.satelliteEnrichment?.data;
  const ndvi = satellite?.ndvi ?? null;

  try {
    const hybrid = resolveHybridCropStage({
      cropName: ctx.farmFieldDoc.cropName,
      sowingDateISO: ctx.sowingDateISO,
      endDateISO: ctx.nowISO,
      historicalWeather: weather.historicalWeather,
      weatherSummary: weather.weatherSummary,
      ndvi,
    });

    const { plantGrowthActivity, phenology } = hybrid;

    ctx.logStep(
      `GDD module (hybrid): DAE=${hybrid.cropAgeDays}d GDD=${hybrid.cumulativeGDD} ` +
        `BBCH=${plantGrowthActivity.bbchStage} ${plantGrowthActivity.stageName} ` +
        `(NDVI=${phenology.phase}, conf=${plantGrowthActivity.stageConfidence})`,
    );

    return moduleResult(MODULE_IDS.GDD_BBCH, {
      plantGrowthActivity,
      cumulativeGDD: hybrid.cumulativeGDD,
      cropAgeDays: hybrid.cropAgeDays,
      gddSource: hybrid.gddSource,
      gddMeta: hybrid.gddMeta,
      gddSeries: hybrid.gddSeries,
      phenology,
      calendarStage: hybrid.calendarStage,
      gddStage: hybrid.gddStage,
      ndviStage: hybrid.ndviStage,
    });
  } catch (err) {
    return moduleResult(
      MODULE_IDS.GDD_BBCH,
      {
        plantGrowthActivity: {
          bbchStage: 0,
          stageName: "Sowing",
          description: "Crop not yet emerged",
          overallProgress: 0,
          stageProgress: 0,
          cumulativeGDD: 0,
          cropAgeDays: 0,
          stageConfidence: 0,
          stageFusionMethod: "fallback",
        },
        cumulativeGDD: 0,
        cropAgeDays: 0,
        gddSource: "none",
      },
      { warnings: [`Hybrid stage failed: ${err?.message || err}`] },
    );
  }
}
