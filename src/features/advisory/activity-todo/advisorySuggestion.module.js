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
  finalizeAdvisoryLanguage,
  mergeLocalizedActivities,
  t,
} from "../utils/i18n/advisoryLocale.js";
import { normalizeAdvisoryLanguage } from "../utils/i18n/advisoryLanguages.js";
import { buildAdvisoryNotificationParameters } from "../utils/notifications/advisoryNotificationParams.js";
import {
  calculateYieldPrecise,
  calculateStandardYieldBaseline,
} from "../yield-calculation/yieldCalculator.js";
import { isMaturityOrHarvestStage } from "../pipeline/advisoryContext.js";
import { BIODROPS_BOKASHI_PRODUCT } from "../pipeline/constants.js";
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
    ctx.logStep("advisory module: using rule-based activities");
    activitiesToDo = ruleBased.activitiesToDo;
    activitiesSource = advisoryResponse ? "hybrid" : "rules";
  } else if (normalizeAdvisoryLanguage(ctx.language) !== "en") {
    activitiesToDo = mergeLocalizedActivities(
      activitiesToDo,
      ruleBased.activitiesToDo,
      ctx.language,
    );
  }

  activitiesToDo = finalizeAdvisoryLanguage(
    activitiesToDo,
    ruleBased.activitiesToDo,
    ctx.language,
  );

  const carbonData =
    ctx.mode === "barren" ? null : (evidence?.carbonData ?? fertilizerMod?.carbonData ?? null);

  const user = ctx.farmFieldDoc.user
    ? await User.findById(ctx.farmFieldDoc.user)
        .populate("organization", "organizationCode")
        .lean()
    : null;
  const organizationCode = String(user?.organization?.organizationCode || "").toUpperCase();
  const recommendedProducts =
    organizationCode === "BIODROPS" ? [BIODROPS_BOKASHI_PRODUCT] : [];

  const activitiesWithProgress = (activitiesToDo || []).map((a) => ({
    ...a,
    progress: a.progress ?? null,
  }));

  const advisory = await FarmAdvisory.create({
    farmFieldId: ctx.farmFieldDoc._id,
    yield: safeYield,
    activitiesToDo: activitiesWithProgress,
    activitiesSource,
    cropHealth,
    plantGrowthActivity,
    npkManagement,
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
  if (user) {
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
