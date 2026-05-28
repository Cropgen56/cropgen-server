import {
  calculateNPKFromfarmField,
  buildBarrenLandNpkFromField,
} from "../../../utils/npk/npkCalculator.js";
import { getNpkAvailability } from "../client/satellite.client.js";
import { MODULE_IDS } from "../pipeline/constants.js";
import { moduleResult } from "../pipeline/moduleResult.js";

export async function runNpkModule(ctx) {
  const weather = ctx.modules.weatherSuggestion?.data;
  const gdd = ctx.modules.gddBbch?.data;
  const satellite = ctx.modules.satelliteEnrichment?.data;

  if (!weather?.weatherSummary || !gdd?.plantGrowthActivity) {
    return moduleResult(MODULE_IDS.NPK, null, {
      errors: ["weather and GDD modules required before NPK"],
    });
  }

  let npkManagement;
  if (ctx.mode === "barren") {
    npkManagement = buildBarrenLandNpkFromField({
      farmField: ctx.farmFieldDoc,
      plantGrowthActivity: gdd.plantGrowthActivity,
      ndvi: satellite?.ndvi,
      water: satellite?.water,
      weatherSummary: weather.weatherSummary,
      language: ctx.language,
    });
  } else {
    let satelliteNpkAvailability = null;
    try {
      if (ctx.geometry && satellite?.snapshotDate) {
        satelliteNpkAvailability = await getNpkAvailability(
          ctx.geometry,
          satellite.snapshotDate,
          {
            bbchStage: gdd?.plantGrowthActivity?.bbchStage ?? null,
            stageName: gdd?.plantGrowthActivity?.stageName ?? null,
          },
        );
      }
    } catch (err) {
      ctx.logStep(
        `NPK module: satellite availability fallback (${err?.message || err})`,
      );
    }

    npkManagement = calculateNPKFromfarmField({
      farmField: ctx.farmFieldDoc,
      ndviLatest: satellite?.ndvi?.ndviLatest,
      waterLatest: satellite?.water?.waterLatest,
      plantGrowthActivity: gdd.plantGrowthActivity,
      weatherSummary: weather.weatherSummary,
      satelliteNpkAvailability,
      language: ctx.language,
    });
  }

  const avail = npkManagement?.available;
  const req = npkManagement?.required;
  const nutrientDeficit = npkManagement?.deficit
    ? npkManagement.deficit
    : avail && req
      ? {
          nitrogenKgPerHa: Math.max(
            0,
            (req.nitrogenKgPerHa ?? 0) - (avail.nitrogenKgPerHa ?? 0),
          ),
          phosphorousKgPerHa: Math.max(
            0,
            (req.phosphorousKgPerHa ?? 0) - (avail.phosphorousKgPerHa ?? 0),
          ),
          potassiumKgPerHa: Math.max(
            0,
            (req.potassiumKgPerHa ?? 0) - (avail.potassiumKgPerHa ?? 0),
          ),
        }
      : {
          nitrogenKgPerHa: 0,
          phosphorousKgPerHa: 0,
          potassiumKgPerHa: 0,
        };

  ctx.logStep("NPK module: complete");
  return moduleResult(MODULE_IDS.NPK, {
    npkManagement,
    nutrientDeficit,
  });
}
