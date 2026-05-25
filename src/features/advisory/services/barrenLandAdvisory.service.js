import FarmAdvisory from "../models/farmAdvisory.model.js";
import FarmField from "../../../models/field.model.js";
import User from "../../../models/user.model.js";
import { createNotification } from "../../../services/notificationCreator.service.js";
import { syncAdvisoryActivitiesToOperations } from "./syncAdvisoryToOperations.service.js";

import {
  getCurrentWeather,
  getForecastWeather,
} from "../clients/observearth.client.js";
import {
  getVegetationTimeseries,
  getWaterTimeseries,
} from "../clients/satellite.client.js";

import { generateBarrenLandAdvisory } from "../utils/llm/generateBarrenLandAdvisory.js";
import { buildBarrenLandActivities } from "../utils/agronomy/barrenLand/barrenLandActivities.js";
import { mergeLocalizedActivities } from "../utils/i18n/advisoryLocale.js";
import {
  buildBarrenLandEvidence,
  buildBarrenLandPlantGrowth,
  buildBarrenLandCropHealth,
} from "../utils/agronomy/barrenLand/barrenLandEvidence.js";
import { buildBarrenLandNpkFromField } from "../../../utils/npk/npkCalculator.js";
import { formatDateISO, buildGeometryFromFarmField } from "../utils/shared/helpers.js";
import {
  assembleWeatherSummary,
  buildWeatherSnapshot,
} from "../utils/weather/weatherSnapshot.utils.js";
import {
  parseNDVIMetrics,
  parseWaterMetrics,
} from "../utils/satellite/index.js";
import { buildAdvisoryNotificationParameters } from "../utils/notifications/advisoryNotificationParams.js";

const BIODROPS_BOKASHI_PRODUCT = {
  productName: "BioDrops Mokashi Bokashi Bucket",
  productImageUrl: "https://m.media-amazon.com/images/I/61HumESyvlL._SL1000_.jpg",
  productSourceUrl: null,
  description: "Complete indoor composting Bokashi bucket and mixture starter.",
};

function limitRangeEndDaysBack(endISO, daysBack = 45) {
  const end = new Date(endISO);
  const start = new Date(end);
  start.setDate(start.getDate() - daysBack);
  return {
    start: formatDateISO(start),
    end: endISO,
  };
}

/**
 * Pre-sowing advisory for fields marked isBarrenLand (no standing crop).
 */
export async function generateBarrenLandAdvisoryForField(
  farmFieldId,
  geometryId,
  language,
  platform = "whatsapp",
  options = {},
) {
  const { lightweight = false } = options;
  const fieldIdStr = String(farmFieldId);
  const logStep = (message) =>
    console.log(`[Advisory:barren] ${fieldIdStr}: ${message}`);

  const now = new Date();
  const nowISO = formatDateISO(now);

  const farmField = await FarmField.findById(farmFieldId).lean();
  if (!farmField) {
    throw new Error(`FarmField not found: ${farmFieldId}`);
  }

  if (!farmField.isBarrenLand) {
    logStep("field is not barren — caller should use standard advisory");
  }

  const expectedSowingISO = formatDateISO(farmField.sowingDate || now);
  logStep(
    `pre-sowing advisory for ${farmField.cropName}, expected sowing ${expectedSowingISO}`,
  );

  logStep("fetching current + forecast weather");
  const [currentSettled, forecastSettled] = await Promise.allSettled([
    getCurrentWeather(geometryId),
    getForecastWeather(geometryId),
  ]);

  const currentWeatherResp =
    currentSettled.status === "fulfilled" ? currentSettled.value : null;
  const forecastWeather =
    forecastSettled.status === "fulfilled" ? forecastSettled.value : null;

  if (!currentWeatherResp && !forecastWeather) {
    throw new Error("Weather unavailable for barren land advisory");
  }

  const weatherSummary = assembleWeatherSummary(
    currentWeatherResp,
    forecastWeather,
  );
  const weatherSnapshot = buildWeatherSnapshot(weatherSummary);

  const geometry = buildGeometryFromFarmField(farmField);
  const satelliteRange = limitRangeEndDaysBack(nowISO, lightweight ? 30 : 45);

  let ndvi = { ndviLatest: null, ndviMean: null, trend: 0, values: [] };
  let water = { waterLatest: null, stressLevel: "unknown", confidence: 0 };

  if (!lightweight) {
    logStep("fetching satellite (bare-field context)");
    const [vegOutcome, waterOutcome] = await Promise.allSettled([
      getVegetationTimeseries(
        geometry,
        satelliteRange.start,
        satelliteRange.end,
        "NDVI",
      ),
      getWaterTimeseries(
        geometry,
        satelliteRange.start,
        satelliteRange.end,
        "NDMI",
      ),
    ]);
    if (vegOutcome.status === "fulfilled") {
      ndvi = parseNDVIMetrics(vegOutcome.value);
    }
    if (waterOutcome.status === "fulfilled") {
      water = parseWaterMetrics(waterOutcome.value);
    }
  }

  const evidence = buildBarrenLandEvidence({
    farmField,
    weatherSummary,
    ndvi,
    water,
    language,
  });

  const plantGrowthActivity = buildBarrenLandPlantGrowth(
    farmField,
    expectedSowingISO,
    language,
  );
  const cropHealth = buildBarrenLandCropHealth(
    farmField,
    evidence.sowingWindow,
    language,
  );
  const npkManagement = buildBarrenLandNpkFromField({
    farmField,
    plantGrowthActivity,
    ndvi,
    water,
    weatherSummary,
    language,
  });

  const yieldSkippedExplanation =
    language === "mr"
      ? "उत्पादन अंदाज फक्त पिक लागवडीनंतर दाखवला जातो."
      : language === "hi"
        ? "उपज अनुमान बुवाई के बाद दिखाया जाता है।"
        : "Yield estimate is available after the crop is sown and established.";

  const safeYield = {
    standardYield: null,
    aiYield: null,
    unit: "quintal",
    explanation: yieldSkippedExplanation,
    yieldGap: null,
  };

  let advisoryResponse = null;
  let activitiesSource = "rules";
  try {
    logStep("generating AI pre-sowing advisory");
    advisoryResponse = await generateBarrenLandAdvisory({ language, evidence });
    if (advisoryResponse?.activitiesToDo?.some((a) => (a?.message || "").trim())) {
      activitiesSource = "llm";
    }
  } catch (err) {
    console.warn("[Advisory:barren] LLM failed:", err?.message || err);
  }

  let activitiesToDo = advisoryResponse?.activitiesToDo ?? null;
  const hasUsableLlm =
    Array.isArray(activitiesToDo) &&
    activitiesToDo.some((a) => (a?.message || "").trim().length > 10);

  const localizedFallback = buildBarrenLandActivities(evidence).activitiesToDo;

  if (!hasUsableLlm) {
    logStep("using rule-based pre-sowing activities");
    activitiesToDo = localizedFallback;
    activitiesSource = advisoryResponse ? "hybrid" : "rules";
  } else {
    activitiesToDo = mergeLocalizedActivities(
      activitiesToDo,
      localizedFallback,
      language,
    );
  }

  const user = farmField.user
    ? await User.findById(farmField.user)
        .populate("organization", "organizationCode")
        .lean()
    : null;
  const organizationCode = String(
    user?.organization?.organizationCode || "",
  ).toUpperCase();
  const recommendedProducts =
    organizationCode === "BIODROPS" ? [BIODROPS_BOKASHI_PRODUCT] : [];

  const activitiesWithProgress = (activitiesToDo || []).map((a) => ({
    ...a,
    progress: a.progress ?? null,
  }));

  const advisory = await FarmAdvisory.create({
    farmFieldId: farmField._id,
    yield: safeYield,
    activitiesToDo: activitiesWithProgress,
    activitiesSource,
    cropHealth,
    plantGrowthActivity,
    npkManagement,
    carbonData: null,
    recommendedProducts,
    opticalIndicesSummary: null,
    weatherSnapshot,
  });

  logStep(`saved pre-sowing advisory ${advisory._id}`);

  try {
    const syncResult = await syncAdvisoryActivitiesToOperations({
      farmFieldId: farmField._id,
      advisoryId: advisory._id,
      activitiesToDo: activitiesWithProgress,
      generatedAt: new Date(),
    });
    if (syncResult.operationIds?.length) {
      await FarmAdvisory.findByIdAndUpdate(advisory._id, {
        linkedOperationIds: syncResult.operationIds,
      });
    }
    logStep(`synced ${syncResult.created} barren-land activities to operations`);
  } catch (syncErr) {
    console.warn("Barren advisory → operations sync failed:", syncErr.message);
  }

  if (user) {
    const notificationParameters = buildAdvisoryNotificationParameters(
      user,
      farmField,
      advisory,
      platform,
    );
    await createNotification({
      user,
      type: "ADVISORY",
      referenceId: advisory._id,
      templateName: "farm_advisory",
      parameters: notificationParameters,
    });
  }

  return advisory;
}
