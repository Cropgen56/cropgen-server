import FarmAdvisory from "../models/farmAdvisory.model.js";
import User from "../../../models/user.model.js";
import { createNotification } from "../../../services/notificationCreator.service.js";
import { saveCarbonFromAdvisory } from "../../../services/carbonTracking.service.js";
import { resolveIrrigationFamily } from "../../../constants/farmEnums.js";
import { generateSmartAdvisory } from "../utils/llm/generateSmartAdvisory.js";
import { generateBarrenLandAdvisory } from "../utils/llm/generateBarrenLandAdvisory.js";
import { finalizeEvidence } from "../utils/evidence/evidenceBuilder.js";
import { buildEvidencePayloadFromContext } from "../pipeline/buildEvidencePayloadFromContext.js";
import { syncAdvisoryActivitiesToOperations } from "../services/syncAdvisoryToOperations.service.js";
import { loadFarmHistory } from "../services/farmHistory.service.js";
import { sendEngineNotifications } from "../services/engineNotifications.service.js";
import { enqueueConditionCheck } from "../queue/conditionMonitor.queue.js";
import { buildActivitiesFromDecisionHints } from "./buildActivitiesFromDecisionHints.js";
import { buildBarrenLandActivities } from "./buildBarrenLandActivities.js";
import { runRulesEngine, loadRules } from "../rules-engine/index.js";
import { ndviDrop } from "../rules-engine/features/satellite.js";
import {
  localizeAdvisoryMetadata,
  sanitizeLlmActivities,
  t,
} from "../utils/i18n/advisoryLocale.js";
import { normalizeAdvisoryLanguage } from "../utils/i18n/advisoryLanguages.js";
import {
  ADVISORY_ACTIVITY_TYPES,
  buildActivityAdvisoryParameters,
  buildAdvisoryNotificationParameters,
  formatActivityTypeLabel,
  getDefaultActivityMessage,
} from "../utils/notifications/advisoryNotificationParams.js";
import {
  calculateYieldPrecise,
  calculateStandardYieldBaseline,
} from "../yield-calculation/yieldCalculator.js";
import { isMaturityOrHarvestStage } from "../pipeline/advisoryContext.js";
import { enrichAdvisoryForClient } from "../utils/enrichAdvisoryForClient.js";
import { getBiodropsRecommendations } from "../../../clients/biodrops/advisory/getBiodropsRecommendations.js";
import { MODULE_IDS } from "../pipeline/constants.js";
import { moduleResult } from "../pipeline/moduleResult.js";

/**
 * ADVISORY_ENGINE
 *   rules  - deterministic rules engine decides spray / irrigation / fertilizer /
 *            alerts from the agronomy workbook. No LLM call.
 *   shadow - (default) farmers get the old output; the engine runs alongside and
 *            its decisions are stored on the advisory (`engineShadow`) so the
 *            agronomy team can compare before switching to `rules`.
 *   llm    - old behaviour only.
 */
export function resolveEngineMode() {
  const mode = String(process.env.ADVISORY_ENGINE || "shadow").toLowerCase();
  return ["rules", "shadow", "llm"].includes(mode) ? mode : "shadow";
}

function yieldSkippedExplanation(language) {
  return t("yield_skipped_maturity", normalizeAdvisoryLanguage(language));
}

function barrenYieldSkippedExplanation(language) {
  return t("yield_skipped_barren", normalizeAdvisoryLanguage(language));
}

/** Stable key for the current fertilizer stage window of this crop instance. */
function fertilizerWindowKey(ctx, evidence) {
  const win = evidence?.fertilizerSchedule?.currentApplication?.bbchWindow;
  if (!win) return null;
  const owner = ctx.cropInstanceId || ctx.farmFieldId;
  return `${owner}:${ctx.sowingDateISO}:${win}`;
}

/**
 * Run the rules engine for this crop. Pure engine call wrapped with the
 * DB-backed history load; never throws (returns { error } instead).
 */
async function runEngineForContext({ ctx, evidence, baseActivities, user, satellite, weather, gdd }) {
  try {
    const rules = loadRules();
    const history = await loadFarmHistory({
      farmFieldId: ctx.farmFieldDoc._id,
      cropInstanceId: ctx.cropInstanceId,
      rules,
      log: ctx.logStep,
    });
    const farm = ctx.farmFieldDoc;
    const regionProfile = farm.regionProfile || {};
    const bbch = gdd?.plantGrowthActivity?.bbchStage ?? 0;
    const result = runRulesEngine({
      rules,
      now: new Date(),
      language: ctx.language,
      farm: {
        cropName: farm.cropName,
        fieldName: farm.fieldName,
        acre: farm.acre,
        typeOfFarming: farm.typeOfFarming,
        typeOfIrrigation: farm.typeOfIrrigation,
        irrigationFamily: resolveIrrigationFamily(farm.typeOfIrrigation),
        soilType: regionProfile.soilType || regionProfile.soilTexture || farm.soilType,
        country: farm.country,
        state: farm.state || regionProfile.state || regionProfile.stateCode,
        waterSource: farm.waterSource,
        irrigationDetails: farm.irrigationDetails,
      },
      crop: {
        bbchStage: bbch,
        stageName: gdd?.plantGrowthActivity?.stageName,
        sowingDate: ctx.sowingDateISO,
      },
      weather: {
        weatherSummary: weather.weatherSummary,
        historical: weather.historicalWeather,
      },
      satellite: {
        ndviDropVsExpected: ndviDrop(satellite?.ndvi, { bbch, todayISO: ctx.nowISO }),
      },
      fertilizer: {
        baseDecision: evidence?.decisionHints?.fertigation,
        windowKey: fertilizerWindowKey(ctx, evidence),
      },
      history,
      user: { firstName: user?.firstName, country: user?.country },
      baseActivities,
    });
    ctx.logStep(
      `engine: spray=${result.decisions.spray.action} irrigation=${result.decisions.irrigation.action} ` +
        `fertilizer=${result.decisions.fertilizer.action} alerts=${result.alerts.length} rules=${result.rulesVersion}`,
    );
    return { result };
  } catch (err) {
    ctx.logStep(`engine: failed - ${err?.message || err}`);
    return { error: err?.message || String(err) };
  }
}

export async function runAdvisorySuggestionModule(ctx) {
  // Weather is optional: without it the advice is generated from the other modules.
  const weather = ctx.modules.weatherSuggestion?.data ?? {};
  const gdd = ctx.modules.gddBbch?.data;
  const npk = ctx.modules.npk?.data;
  const cropHealthMod = ctx.modules.cropHealth?.data;
  const fertilizerMod = ctx.modules.fertilizerRecommendation?.data;
  const sprayMod = ctx.modules.sprayRecommendation?.data;
  const satellite = ctx.modules.satelliteEnrichment?.data;
  const engineMode = ctx.mode === "barren" ? "llm" : resolveEngineMode();

  if (!gdd || !npk || !cropHealthMod) {
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

  // Rule-based activities: always built. They are the fallback, and the
  // engine reuses their WEATHER / CROP_RISK / CARBON / FERTIGATION text.
  const ruleBased =
    ctx.mode === "barren"
      ? buildBarrenLandActivities(evidence)
      : buildActivitiesFromDecisionHints(evidence);

  let activitiesToDo = null;
  let activitiesSource = "rules";
  let engineRun = null;

  if (engineMode === "rules") {
    engineRun = await runEngineForContext({
      ctx,
      evidence,
      baseActivities: ruleBased.activitiesToDo,
      user,
      satellite,
      weather,
      gdd,
    });
    if (engineRun.result) {
      activitiesToDo = engineRun.result.activitiesToDo;
      activitiesSource = "engine";
    } else {
      ctx.logStep("advisory module: engine failed - using rule-based activities");
      activitiesToDo = ruleBased.activitiesToDo;
      activitiesSource = "rules";
    }
  } else {
    let advisoryResponse = null;
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

    activitiesToDo = advisoryResponse?.activitiesToDo ?? null;
    const hasUsableLlm =
      Array.isArray(activitiesToDo) &&
      activitiesToDo.some((a) => (a?.message || "").trim().length > 10);

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

    if (engineMode === "shadow") {
      engineRun = await runEngineForContext({
        ctx,
        evidence,
        baseActivities: ruleBased.activitiesToDo,
        user,
        satellite,
        weather,
        gdd,
      });
    }
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

  const engineResult = engineRun?.result || null;
  const engineFields = {};
  if (engineResult) {
    const engineMeta = {
      name: engineResult.engine,
      mode: engineMode,
      rulesVersion: engineResult.rulesVersion,
      liveStatuses: engineResult.liveStatuses,
      country: engineResult.country,
      farmingType: engineResult.farmingType,
      cropKey: engineResult.cropKey,
      dataQuality: engineResult.dataQuality,
    };
    const firedAt = new Date();
    const alerts = (engineResult.whatsapp.alerts || []).map((a) => ({
      alertId: a.alertId,
      severity: a.severity,
      vars: engineResult.alerts.find((x) => x.alertId === a.alertId)?.vars || {},
      sentAt: firedAt,
      whatsapp: a.send,
    }));
    if (engineMode === "rules") {
      Object.assign(engineFields, {
        engine: engineMeta,
        decisions: engineResult.decisions,
        alerts,
        whatsappPreview: {
          daily: engineResult.whatsapp.daily,
          alerts: engineResult.whatsapp.alerts,
          fertilizer: engineResult.whatsapp.fertilizer,
        },
      });
    } else {
      // Shadow mode: store for comparison only. Alerts are not recorded as
      // sent, so cooldowns stay clean for when the engine goes live.
      engineFields.engineShadow = {
        engine: engineMeta,
        decisions: engineResult.decisions,
        alerts,
        activitiesToDo: engineResult.activitiesToDo,
        whatsappPreview: engineResult.whatsapp,
      };
    }
  } else if (engineRun?.error) {
    engineFields.engine = { name: "rules", mode: engineMode, error: engineRun.error };
  }

  const advisory = await FarmAdvisory.create({
    farmFieldId: ctx.farmFieldDoc._id,
    cropInstanceId: ctx.cropInstanceId || null,
    yield: safeYield,
    activitiesToDo: activitiesWithProgress,
    activitiesSource,
    language: ctx.language,
    cropHealth: localizedCropHealth,
    plantGrowthActivity: clientPlantGrowth,
    npkManagement: clientNpkManagement,
    carbonData,
    recommendedProducts,
    opticalIndicesSummary: satellite?.opticalIndicesSummary ?? null,
    weatherSnapshot,
    ...engineFields,
  });

  try {
    const syncResult = await syncAdvisoryActivitiesToOperations({
      farmFieldId: ctx.farmFieldDoc._id,
      advisoryId: advisory._id,
      activitiesToDo: activitiesWithProgress,
      generatedAt: new Date(),
      onlyActionable: activitiesSource === "engine",
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
        cropInstanceId: ctx.cropInstanceId || null,
        advisoryId: advisory._id,
        date: ctx.nowISO.slice(0, 10),
        carbonData,
      });
    } catch (err) {
      ctx.logStep(`advisory module: carbon save failed - ${err.message}`);
    }
  }

  let notified = false;
  if (ctx.notify && user) {
    if (activitiesSource === "engine" && engineResult && user.phone) {
      const { mode, sent } = await sendEngineNotifications({
        user,
        farmField: ctx.farmFieldDoc,
        advisory,
        engineResult,
      });
      notified = sent.length > 0;
      ctx.logStep(`advisory module: engine notifications (${mode}) sent=${sent.join(",") || "none"}`);
    } else if (user.phone) {
      const notificationTasks = [];
      for (const type of ADVISORY_ACTIVITY_TYPES) {
        const activity = advisory.activitiesToDo.find((a) => a.type === type) || {
          type,
          title: formatActivityTypeLabel(type, user.language),
          message: getDefaultActivityMessage(type, user.language),
          details: {},
        };
        notificationTasks.push(
          createNotification({
            user,
            type: "ADVISORY",
            referenceId: advisory._id,
            templateName: "advisory",
            parameters: buildActivityAdvisoryParameters(
              user,
              ctx.farmFieldDoc,
              activity,
            ),
          }),
        );
      }
      if (notificationTasks.length) {
        const settled = await Promise.allSettled(notificationTasks);
        notified = settled.some((entry) => entry.status === "fulfilled");
        ctx.logStep(
          `advisory module: notifications queued=${notificationTasks.length} types=${ADVISORY_ACTIVITY_TYPES.join(",")}`,
        );
      }
    } else if (user.email) {
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
  }

  if (ctx.mode !== "barren") {
    // Refresh the field condition (popup events) right after a new advisory.
    await enqueueConditionCheck({
      farmFieldId: ctx.farmFieldDoc._id,
      cropInstanceId: ctx.cropInstanceId,
      trigger: "advisory",
      delayMs: 2 * 60 * 1000,
    });
  }

  return moduleResult(MODULE_IDS.ADVISORY, {
    advisory,
    evidence,
    safeYield,
    activitiesSource,
    activitiesCount: activitiesWithProgress.length,
    notified,
    engineMode,
    engineDecisions: engineResult?.decisions ?? null,
    weatherSuggestion: weather.weatherSuggestion,
    fertilizerRecommendation: fertilizerMod?.fertilizerRecommendation,
    sprayRecommendation: sprayMod?.sprayRecommendation,
  });
}
