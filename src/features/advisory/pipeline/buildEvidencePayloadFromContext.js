import { buildEvidencePayload } from "../utils/evidence/evidenceBuilder.js";

/**
 * @param {import('./advisoryContext.js').AdvisoryPipelineContext} ctx
 * @param {{ yieldGap?: object | null }} [options]
 */
export function buildEvidencePayloadFromContext(ctx, options = {}) {
  const weather = ctx.modules.weatherSuggestion?.data;
  const satellite = ctx.modules.satelliteEnrichment?.data;
  const gdd = ctx.modules.gddBbch?.data;
  const npk = ctx.modules.npk?.data;
  const cropHealthMod = ctx.modules.cropHealth?.data;

  const { rawEvidence, isHarvestStage } = buildEvidencePayload({
    farmField: ctx.farmFieldDoc,
    weatherSummary: weather?.weatherSummary,
    ndvi: satellite?.ndvi,
    water: satellite?.water,
    plantGrowthActivity: gdd?.plantGrowthActivity,
    npkManagement: npk?.npkManagement,
    cropHealth: cropHealthMod?.cropHealth,
    regionProfile: ctx.farmFieldDoc.regionProfile ?? {},
    yieldGap: options.yieldGap ?? null,
    opticalIndicesSummary: satellite?.opticalIndicesSummary ?? null,
  });

  return { rawEvidence, isHarvestStage };
}
