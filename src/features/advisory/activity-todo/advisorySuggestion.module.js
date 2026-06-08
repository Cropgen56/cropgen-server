import FarmAdvisory from "../models/farmAdvisory.model.js";
import User from "../../../models/user.model.js";
import { createNotification } from "../../../services/notificationCreator.service.js";
import { saveCarbonFromAdvisory } from "../../../services/carbonTracking.service.js";
import { generateSmartAdvisory } from "../utils/llm/generateSmartAdvisory.js";
import { generateBarrenLandAdvisory } from "../utils/llm/generateBarrenLandAdvisory.js";
import { finalizeEvidence } from "../utils/evidence/evidenceBuilder.js";
import { buildEvidencePayloadFromContext } from "../pipeline/buildEvidencePayloadFromContext.js";
import { syncAdvisoryActivitiesToOperations } from "../services/syncAdvisoryToOperations.service.js";
import { buildActivitiesFromDecisionHints } from "./buildActivitiesFromDecisionHints.js";
import { buildBarrenLandActivities } from "./buildBarrenLandActivities.js";
import {
  localizeAdvisoryMetadata,
  sanitizeLlmActivities,
  t,
} from "../utils/i18n/advisoryLocale.js";
import { normalizeAdvisoryLanguage } from "../utils/i18n/advisoryLanguages.js";
import { buildAdvisoryNotificationParameters } from "../utils/notifications/advisoryNotificationParams.js";
import {
  calculateYieldPrecise,
  calculateStandardYieldBaseline,
} from "../yield-calculation/yieldCalculator.js";
import { isMaturityOrHarvestStage } from "../pipeline/advisoryContext.js";
import { enrichAdvisoryForClient } from "../utils/enrichAdvisoryForClient.js";
import { getBiodropsRecommendations } from "../../../clients/biodrops/advisory/getBiodropsRecommendations.js";
import { isCropgenOrganizationCode } from "../utils/advisoryOrganization.js";
import { MODULE_IDS } from "../pipeline/constants.js";
import { moduleResult } from "../pipeline/moduleResult.js";

function yieldSkippedExplanation(language) {
  return t("yield_skipped_maturity", normalizeAdvisoryLanguage(language));
}

function barrenYieldSkippedExplanation(language) {
  return t("yield_skipped_barren", normalizeAdvisoryLanguage(language));
}

export async function runAdvisorySuggestionModule(ctx) {
  const weather = ctx.modules.weatherSuggestion?.data;
  const gdd = ctx.modules.gddBbch?.data;
  const npk = ctx.modules.npk?.data;
  const cropHealthMod = ctx.modules.cropHealth?.data;
  const fertilizerMod = ctx.modules.fertilizerRecommendation?.data;
  const sprayMod = ctx.modules.sprayRecommendation?.data;
  const satellite = ctx.modules.satelliteEnrichment?.data;

  if (!weather || !gdd || !npk || !cropHealthMod) {
    return moduleResult(MODULE_IDS.ADVISORY, null, {
      errors: ["modules 1-4 must complete before advisory suggestion"],
    });
  }

  const plantGrowthActivity = gdd.plantGrowthActivity;
  const cropHealth = cropHealthMod.cropHealth;
  const npkManagement = npk.npkManagement;
  const weatherSnapshot = weather.weatherSnapshot;

  let evidence;
  let safeYield;
  let isMaturity = false;

  if (ctx.mode === "barren") {
    evidence = ctx.stash.barrenEvidence;
    if (!evidence) {
      return moduleResult(MODULE_IDS.ADVISORY, null, {
        errors: ["barren evidence missing from crop health module"],
      });
    }
    safeYield = {
      standardYield: null,
      aiYield: null,
      unit: "quintal",
      explanation: barrenYieldSkippedExplanation(ctx.language),
      yieldGap: null,
    };
  } else {
    isMaturity = isMaturityOrHarvestStage(plantGrowthActivity);
    const standardBaseline = calculateStandardYieldBaseline(ctx.farmFieldDoc);
    let yieldInfo = null;
    if (isMaturity) {
      yieldInfo = calculateYieldPrecise({
        farmField: ctx.farmFieldDoc,
        cropHealth,
        plantGrowthActivity,
        npkManagement,
        ndvi: satellite?.ndvi,
        water: satellite?.water,
        weatherSummary: weather.weatherSummary,
        language: ctx.language,
      });
    }

    safeYield = isMaturity
      ? {
          standardYield: yieldInfo?.yield?.standardYield ?? null,
          aiYield: yieldInfo?.yield?.aiYield ?? null,
          unit: yieldInfo?.yield?.unit || "quintal",
          explanation: yieldInfo?.yield?.explanation || "",
          yieldGap: yieldInfo?.yieldGap ?? null,
        }
      : {
          standardYield: standardBaseline.standardYield,
          aiYield: null,
          unit: standardBaseline.unit,
          explanation: yieldSkippedExplanation(ctx.language),
          yieldGap: null,
        };

    const { rawEvidence, isHarvestStage } = buildEvidencePayloadFromContext(ctx, {
      yieldGap: isMaturity ? safeYield.yieldGap : null,
    });
    evidence = finalizeEvidence({
      rawEvidence,
      isHarvestStage,
      language: ctx.language,
      decisionOverrides: {
        fertigation: fertilizerMod?.fertilizerRecommendation,
        spray: sprayMod?.sprayRecommendation,
      },
    });
  }

  const user = ctx.farmFieldDoc.user
    ? await User.findById(ctx.farmFieldDoc.user)
        .populate("organization", "organizationCode")
        .lean()
    : null;
  const organizationCode = String(user?.organization?.organizationCode || "").toUpperCase();

  let biodropsRecommendations = null;
  if (organizationCode === "BIODROPS") {
    biodropsRecommendations = getBiodropsRecommendations({
      cropName: ctx.farmFieldDoc.cropName,
      acre: ctx.farmFieldDoc.acre,
      bbchStage: plantGrowthActivity?.bbchStage ?? evidence?.bbchStage ?? 0,
      typeOfFarming: ctx.farmFieldDoc.typeOfFarming,
      mode: ctx.mode === "barren" ? "barren" : "crop",
    });
    evidence = {
      ...evidence,
      biodropsAdvisory: {
        cropLabel: biodropsRecommendations.cropLabel,
        applicationNote: biodropsRecommendations.applicationNote,
        typeOfFarming: biodropsRecommendations.typeOfFarming,
        productHints: biodropsRecommendations.productHints,
      },
    };
    ctx.logStep(
      `advisory module: Biodrops products for ${biodropsRecommendations.cropLabel} (${biodropsRecommendations.productHints.length} active hints)`,
    );
  }

  let advisoryResponse = null;
  let activitiesSource = "rules";

  try {
    ctx.logStep("advisory module: generating AI activities");
    advisoryResponse =
      ctx.mode === "barren"
        ? await generateBarrenLandAdvisory({ language: ctx.language, evidence })
        : await generateSmartAdvisory({ language: ctx.language, evidence });
    if (advisoryResponse?.activitiesToDo?.some((a) => (a?.message || "").trim())) {
      activitiesSource = "llm";
    }
  } catch (err) {
    ctx.logStep(`advisory module: LLM failed - ${err?.message || err}`);
  }

  let activitiesToDo = advisoryResponse?.activitiesToDo ?? null;
  const hasUsableLlm =
    Array.isArray(activitiesToDo) &&
    activitiesToDo.some((a) => (a?.message || "").trim().length > 10);

  const ruleBased =
    ctx.mode === "barren"
      ? buildBarrenLandActivities(evidence)
      : buildActivitiesFromDecisionHints(evidence);

  if (!hasUsableLlm) {
    ctx.logStep("advisory module: using rule-based activities (LLM unavailable)");
    activitiesToDo = ruleBased.activitiesToDo;
    activitiesSource = advisoryResponse ? "hybrid" : "rules";
  } else {
    ctx.logStep("advisory module: using LLM-generated activities");
    activitiesToDo = sanitizeLlmActivities(
      activitiesToDo,
      ruleBased.activitiesToDo,
      ctx.language,
    );
  }

  const localizedMeta = localizeAdvisoryMetadata({
    plantGrowthActivity,
    cropHealth,
    npkManagement,
    language: ctx.language,
  });
  const localizedPlantGrowth = localizedMeta.plantGrowthActivity;
  const localizedCropHealth = localizedMeta.cropHealth;
  const localizedNpkManagement = localizedMeta.npkManagement;

  const enrichedForClient = enrichAdvisoryForClient(
    {
      plantGrowthActivity: localizedPlantGrowth,
      npkManagement: localizedNpkManagement,
    },
    { language: ctx.language, farmField: ctx.farmFieldDoc },
  );
  const clientNpkManagement = enrichedForClient.npkManagement;
  const clientPlantGrowth = enrichedForClient.plantGrowthActivity;

  const carbonData =
    ctx.mode === "barren" ? null : (evidence?.carbonData ?? fertilizerMod?.carbonData ?? null);

  const recommendedProducts =
    organizationCode === "BIODROPS"
      ? (biodropsRecommendations?.recommendedProducts ?? [])
      : [];

  const activitiesWithProgress = (activitiesToDo || []).map((a) => ({
    ...a,
    progress: a.progress ?? null,
  }));

  const advisory = await FarmAdvisory.create({
    farmFieldId: ctx.farmFieldDoc._id,
    yield: safeYield,
    activitiesToDo: activitiesWithProgress,
    activitiesSource,
    cropHealth: localizedCropHealth,
    plantGrowthActivity: clientPlantGrowth,
    npkManagement: clientNpkManagement,
    carbonData,
    recommendedProducts,
    opticalIndicesSummary: satellite?.opticalIndicesSummary ?? null,
    weatherSnapshot,
  });

  try {
    const syncResult = await syncAdvisoryActivitiesToOperations({
      farmFieldId: ctx.farmFieldDoc._id,
      advisoryId: advisory._id,
      activitiesToDo: activitiesWithProgress,
      generatedAt: new Date(),
    });
    if (syncResult.operationIds?.length) {
      await FarmAdvisory.findByIdAndUpdate(advisory._id, {
        linkedOperationIds: syncResult.operationIds,
      });
    }
  } catch (syncErr) {
    ctx.logStep(`advisory module: operations sync failed - ${syncErr.message}`);
  }

  if (carbonData && ctx.farmFieldDoc.user) {
    try {
      await saveCarbonFromAdvisory({
        userId: ctx.farmFieldDoc.user,
        farmFieldId: ctx.farmFieldDoc._id,
        advisoryId: advisory._id,
        date: ctx.nowISO.slice(0, 10),
        carbonData,
      });
    } catch (err) {
      ctx.logStep(`advisory module: carbon save failed - ${err.message}`);
    }
  }

  let notified = false;
  if (user && isCropgenOrganizationCode(organizationCode)) {
    const notificationParameters = buildAdvisoryNotificationParameters(
      user,
      ctx.farmFieldDoc,
      advisory,
      ctx.platform,
    );
    await createNotification({
      user,
      type: "ADVISORY",
      referenceId: advisory._id,
      templateName: "farm_advisory",
      parameters: notificationParameters,
    });
    notified = true;
  }

  return moduleResult(MODULE_IDS.ADVISORY, {
    advisory,
    evidence,
    safeYield,
    activitiesSource,
    activitiesCount: activitiesWithProgress.length,
    notified,
    weatherSuggestion: weather.weatherSuggestion,
    fertilizerRecommendation: fertilizerMod?.fertilizerRecommendation,
    sprayRecommendation: sprayMod?.sprayRecommendation,
  });
}
