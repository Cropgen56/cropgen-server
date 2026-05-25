import FarmAdvisory from "../models/farmAdvisory.model.js";
import FarmField from "../../../models/field.model.js";
import { createNotification } from "../../../services/notificationCreator.service.js";
import { saveCarbonFromAdvisory } from "../../../services/carbonTracking.service.js";
import User from "../../../models/user.model.js";

import { fetchWeatherBundle } from "../clients/observearth.client.js";

import {
  getVegetationTimeseries,
  getWaterTimeseries,
  fetchOpticalIndexSnapshots,
  getImageAvailability,
} from "../clients/satellite.client.js";

import { generateSmartAdvisory } from "../utils/llm/generateSmartAdvisory.js";
import { buildEvidence } from "../utils/evidence/evidenceBuilder.js";

import { formatDateISO, buildGeometryFromFarmField } from "../utils/shared/helpers.js";
import {
  parseNDVIMetrics,
  parseWaterMetrics,
  getLatestVegetationTimeseriesDate,
  buildOpticalIndicesSummary,
} from "../utils/satellite/index.js";

import { getBaseTemperature } from "../../../utils/crop/growth/gddCalculator.js";

import { calculateNPKFromfarmField } from "../../../utils/npk/npkCalculator.js";
import { calcCropHealth } from "../../../utils/crop/health/cropHealth.js";
import { calculateYieldPrecise } from "../utils/yield/yieldCalculator.js";
import {
  assembleWeatherSummary,
  buildWeatherSnapshot,
} from "../utils/weather/weatherSnapshot.utils.js";
import { resolveGDDAndGrowthStage } from "../utils/weather/gddFromWeatherSummary.js";
import { selectOpticalIndicesForAdvisory } from "../utils/agronomy/opticalIndexSelection.js";
import { buildActivitiesFromDecisionHints } from "../utils/agronomy/activitiesFromDecisionHints.js";
import { buildAdvisoryNotificationParameters } from "../utils/notifications/advisoryNotificationParams.js";
import { generateBarrenLandAdvisoryForField } from "./barrenLandAdvisory.service.js";
import { mergeLocalizedActivities } from "../utils/i18n/advisoryLocale.js";

const ACRE_TO_HA = 0.404686;
const BIODROPS_BOKASHI_PRODUCT = {
  productName: "BioDrops Mokashi Bokashi Bucket",
  productImageUrl: "https://m.media-amazon.com/images/I/61HumESyvlL._SL1000_.jpg",
  productSourceUrl: null,
  description: "Complete indoor composting Bokashi bucket and mixture starter.",
};
const summarizeGeometry = () => null;
const summarizeOpticalIndexRowsForFlow = () => [];
const cloneForAdvisoryFlowLog = () => undefined;

function summarizeTimeseriesPayload(payload) {
  const series =
    payload?.timeseries ||
    payload?.data?.timeseries ||
    payload?.results ||
    (Array.isArray(payload) ? payload : []);
  const arr = Array.isArray(series) ? series : [];
  return {
    seriesLength: arr.length,
    firstDates: arr.slice(0, 3).map((p) => p?.date ?? p?.timestamp ?? p?.time ?? null),
    lastDates: arr.slice(-2).map((p) => p?.date ?? p?.timestamp ?? p?.time ?? null),
  };
}

function formatAreaForNotification(acre, platform = "whatsapp") {
  const value = Number(acre);
  if (!Number.isFinite(value) || value < 0) {
    return platform === "web" ? "0 ha" : "0 Acre";
  }

  if (platform === "web") {
    const ha = (value * ACRE_TO_HA).toFixed(2);
    return `${ha} ha`;
  }

  const rounded = (Math.round(value * 100) / 100).toFixed(2);
  return `${rounded} Acre`;
}

function limitSatelliteRange(startISO, endISO, maxDays = 90) {
  const start = new Date(startISO);
  const end = new Date(endISO);

  const limitedEnd = new Date(start);
  limitedEnd.setDate(limitedEnd.getDate() + maxDays);

  return {
    start: startISO,
    end: limitedEnd < end ? formatDateISO(limitedEnd) : endISO,
  };
}

/**
 * Picks a low-cloud scene date from availability API.
 * Strategy:
 * 1) Prefer latest date with cloud_cover <= maxCloudPercent.
 * 2) Fallback to minimum cloud_cover date.
 */
function pickLowCloudDate(availability, fallbackDate, maxCloudPercent = 20) {
  const items = Array.isArray(availability?.items) ? availability.items : [];
  const rows = items
    .map((it) => ({
      date: String(it?.date || "").slice(0, 10),
      cloud: Number(it?.cloud_cover),
    }))
    .filter((it) => it.date && Number.isFinite(it.cloud));

  if (!rows.length) return fallbackDate;

  const lowCloud = rows.filter((it) => it.cloud <= maxCloudPercent);
  if (lowCloud.length) {
    const sorted = [...lowCloud].sort((a, b) => a.date.localeCompare(b.date));
    return sorted.at(-1)?.date || fallbackDate;
  }

  const minCloud = [...rows].sort((a, b) => a.cloud - b.cloud);
  return minCloud[0]?.date || fallbackDate;
}

export async function generateAdvisoryForField(
  farmFieldId,
  geometryId,
  language,
  platform = "whatsapp",
  options = {},
) {
  const { preferShortHistoricalWindow = false, lightweight = false } = options;
  const fieldIdStr = String(farmFieldId);
  const logStep = (message) => console.log(`[Advisory] ${fieldIdStr}: ${message}`);

  const flow = {
    addStep() {},
    setOutcome() {},
    setError() {},
    async writeToDisk() {},
  };

  try {
    logStep(
      lightweight
        ? "started (fast path — new farm)"
        : "started",
    );
    const now = new Date();
    const nowISO = formatDateISO(now);

    const farmField = await FarmField.findById(farmFieldId).lean();
    if (!farmField) {
      flow.addStep({
        step: "load_field",
        service: "mongoose",
        apiOrFn: "FarmField.findById",
        inputs: { farmFieldId: String(farmFieldId) },
        output: null,
        notes: "FarmField not found",
      });
      throw new Error(`FarmField not found: ${farmFieldId}`);
    }

    flow.addStep({
      step: "load_field",
      service: "mongoose",
      apiOrFn: "FarmField.findById",
      inputs: { farmFieldId: String(farmFieldId) },
      output: {
        cropName: farmField.cropName,
        fieldName: farmField.fieldName,
        acre: farmField.acre,
        sowingDate: farmField.sowingDate,
        isBarrenLand: Boolean(farmField.isBarrenLand),
        boundaryPointCount: Array.isArray(farmField.field) ? farmField.field.length : 0,
      },
      outputFull: cloneForAdvisoryFlowLog(farmField),
    });

    if (farmField.isBarrenLand) {
      logStep("barren land — pre-sowing advisory path");
      return generateBarrenLandAdvisoryForField(
        farmFieldId,
        geometryId,
        language,
        platform,
        { lightweight },
      );
    }

    const sowingDateISO = formatDateISO(farmField.sowingDate || now);
    const geometry = buildGeometryFromFarmField(farmField);
    flow.addStep({
      step: "build_geometry",
      service: "advisory/utils/shared/helpers",
      apiOrFn: "buildGeometryFromFarmField",
      inputs: { boundaryPointCount: Array.isArray(farmField.field) ? farmField.field.length : 0 },
      calculated: "GeoJSON Polygon from field vertices (convex hull when applicable)",
      output: summarizeGeometry(geometry),
      outputFull: cloneForAdvisoryFlowLog(geometry),
      notes: "Polygon is sent to CropGen satellite APIs; Observearth uses geometryId separately",
    });

    logStep("fetching weather (Observearth)");
    const weatherBundle = await fetchWeatherBundle(
      geometryId,
      sowingDateISO,
      nowISO,
      {
        preferShortWindows: preferShortHistoricalWindow,
        onProgress: (msg) => logStep(`weather: ${msg}`),
      },
    );

    const currentWeatherResp = weatherBundle.currentWeatherResp;
    const forecastWeather = weatherBundle.forecastWeather;
    const historicalWeather = weatherBundle.historicalWeather;
    const historicalWeatherError = weatherBundle.historicalError
      ? weatherBundle.historicalError?.message ||
        String(weatherBundle.historicalError)
      : null;

    if (!historicalWeather && historicalWeatherError) {
      logStep(
        `historical unavailable — will estimate GDD from current+forecast: ${historicalWeatherError}`,
      );
    } else if (weatherBundle.historicalWindowDays) {
      logStep(
        `weather loaded (historical ${weatherBundle.historicalWindowDays}d window)`,
      );
    } else {
      logStep("weather loaded");
    }

    flow.addStep({
      step: "fetch_weather",
      service: "observearth",
      apiOrFn: "GET /current + /forecast + /historical",
      inputs: { geometryId, sowingDateISO, nowISO },
      rawResponseSummary: {
        currentTopKeys:
          currentWeatherResp && typeof currentWeatherResp === "object"
            ? Object.keys(currentWeatherResp).slice(0, 15)
            : [],
        forecastTopKeys:
          forecastWeather && typeof forecastWeather === "object"
            ? Object.keys(forecastWeather).slice(0, 15)
            : [],
        historicalTopKeys:
          historicalWeather && typeof historicalWeather === "object"
            ? Object.keys(historicalWeather).slice(0, 15)
            : [],
        historicalFailed: Boolean(historicalWeatherError),
      },
      rawApiResponsesFull: {
        currentWeather: cloneForAdvisoryFlowLog(currentWeatherResp),
        forecastWeather: cloneForAdvisoryFlowLog(forecastWeather),
        historicalWeather: cloneForAdvisoryFlowLog(historicalWeather),
        historicalWeatherError,
      },
      calculated: "Normalized weatherSummary (current + next7Days forecast slices)",
      notes: historicalWeatherError
        ? `Historical weather skipped: ${historicalWeatherError}`
        : undefined,
    });

    const weatherSummary = assembleWeatherSummary(
      currentWeatherResp,
      forecastWeather,
    );
    const weatherSnapshot = buildWeatherSnapshot(weatherSummary);

    flow.addStep({
      step: "assemble_weather_summary",
      service: "advisory.service",
      apiOrFn: "weatherSummary",
      output: {
        current: weatherSummary.current,
        next7DaysLengths: {
          dates: weatherSummary.next7Days.dates?.length,
          rainfall: weatherSummary.next7Days.rainfall?.length,
          et0: weatherSummary.next7Days.et0?.length,
        },
      },
      outputFull: cloneForAdvisoryFlowLog(weatherSummary),
    });

    const satelliteRange = limitSatelliteRange(sowingDateISO, nowISO, 90);
    flow.addStep({
      step: "satellite_date_window",
      service: "advisory.service",
      apiOrFn: "limitSatelliteRange",
      inputs: { sowingDateISO, nowISO, maxDays: 90 },
      output: satelliteRange,
      outputFull: cloneForAdvisoryFlowLog(satelliteRange),
    });

    logStep("fetching satellite NDVI and water stress (parallel)");
    let ndvi = {
      ndviLatest: null,
      ndviMean: null,
      trend: 0,
      ndviTrend: 0,
      values: [],
    };
    let latestVegDate = satelliteRange.end.slice(0, 10);
    let water = {
      waterLatest: null,
      waterMean: null,
      stressLevel: "unknown",
      confidence: 0,
    };

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
      latestVegDate =
        getLatestVegetationTimeseriesDate(vegOutcome.value) || latestVegDate;
      flow.addStep({
        step: "vegetation_timeseries",
        service: "cropgen_satellite",
        apiOrFn: "POST /timeseries/vegetation/vegetation (NDVI)",
        output: { ndvi, latestVegDate },
      });
    } else {
      console.warn(
        "[Advisory] Vegetation timeseries failed:",
        vegOutcome.reason?.message || vegOutcome.reason,
      );
      flow.addStep({
        step: "vegetation_timeseries",
        notes: `Failed: ${vegOutcome.reason?.message || vegOutcome.reason}`,
        output: { ndvi, latestVegDate },
      });
    }

    if (waterOutcome.status === "fulfilled") {
      water = parseWaterMetrics(waterOutcome.value);
      flow.addStep({
        step: "water_timeseries",
        service: "cropgen_satellite",
        apiOrFn: "POST /timeseries/water/water (NDMI)",
        output: water,
      });
    } else {
      console.warn(
        "[Advisory] Water timeseries failed:",
        waterOutcome.reason?.message || waterOutcome.reason,
      );
      flow.addStep({
        step: "water_timeseries",
        notes: `Failed: ${waterOutcome.reason?.message || waterOutcome.reason}`,
        output: water,
      });
    }

    let snapshotDate = latestVegDate;
    try {
      const availability = await getImageAvailability(
        geometry,
        satelliteRange.start,
        satelliteRange.end,
        "sentinel",
        "s2",
      );
      snapshotDate = pickLowCloudDate(availability, latestVegDate, 20);
      const items = Array.isArray(availability?.items) ? availability.items : [];
      flow.addStep({
        step: "image_availability",
        service: "cropgen_satellite",
        apiOrFn: "POST /availability/",
        inputs: {
          geometry: summarizeGeometry(geometry),
          start_date: satelliteRange.start,
          end_date: satelliteRange.end,
          provider: "sentinel",
          satellite: "s2",
        },
        rawResponseSummary: { itemsCount: items.length },
        rawApiResponseFull: cloneForAdvisoryFlowLog(availability),
        calculated: "pickLowCloudDate (prefer cloud<=20%, else min cloud)",
        output: { snapshotDate, latestVegDate },
        outputFull: cloneForAdvisoryFlowLog({ snapshotDate, latestVegDate, availabilityItems: items }),
      });
    } catch (err) {
      console.warn(
        "Availability API failed, using latest vegetation date:",
        err?.message || err,
      );
      flow.addStep({
        step: "image_availability",
        service: "cropgen_satellite",
        apiOrFn: "POST /availability/",
        notes: `Failed: ${err?.message || err}; using latestVegDate for snapshot`,
        output: { snapshotDate, latestVegDate },
        outputFull: cloneForAdvisoryFlowLog({ snapshotDate, latestVegDate, error: String(err?.message || err) }),
      });
    }

    const baseTemp = getBaseTemperature(farmField.cropName);

    let cumulativeGDD = 0;
    let plantGrowthActivity = {
      bbchStage: 0,
      stageName: "Sowing",
      description: "Crop not yet emerged",
      overallProgress: 0,
      stageProgress: 0,
      gddSource: "none",
    };
    let gddSeries = null;
    let gddSource = "historical";
    let gddMeta = {};

    try {
      const gddResult = resolveGDDAndGrowthStage({
        historicalWeather,
        weatherSummary,
        baseTemp,
        sowingDateISO,
        cropName: farmField.cropName,
        ndvi,
        endDateISO: nowISO,
      });
      gddSeries = gddResult.gddSeries;
      cumulativeGDD = gddResult.cumulativeGDD;
      plantGrowthActivity = gddResult.plantGrowthActivity;
      gddSource = gddResult.gddSource;
      gddMeta = gddResult.gddMeta;

      if (gddSource === "current_forecast_estimate") {
        logStep(
          `GDD estimated from current+forecast: ${cumulativeGDD} (${gddMeta.daysSinceSowing}d × ~${gddMeta.avgDailyGDD} GDD/d)`,
        );
      } else {
        logStep(`GDD from historical weather: ${cumulativeGDD}`);
      }

      flow.addStep({
        step: "gdd_crop_growth",
        service: "gddFromWeatherSummary.resolveGDDAndGrowthStage",
        apiOrFn:
          gddSource === "historical"
            ? "calculateCumulativeGDD(historical)"
            : "estimateGDDFromCurrentAndForecast",
        inputs: { cropName: farmField.cropName, baseTemp, sowingDateISO, gddSource },
        rawResponseSummary: {
          gddSeriesLength: gddSeries?.length ?? 0,
          gddSource,
          gddMeta,
        },
        rawInputHistoricalWeatherFull: cloneForAdvisoryFlowLog(historicalWeather),
        rawSeriesFull: gddSeries ? cloneForAdvisoryFlowLog(gddSeries) : null,
        calculated: "cumulativeGDD, plantGrowthActivity (BBCH, progress, stage name)",
        output: { cumulativeGDD, plantGrowthActivity, gddSource },
        outputFull: cloneForAdvisoryFlowLog({
          cumulativeGDD,
          plantGrowthActivity,
          ndviInputs: ndvi,
          gddMeta,
        }),
      });
    } catch (err) {
      console.error("GDD calculation failed:", err);
      flow.addStep({
        step: "gdd_crop_growth",
        notes: `Failed: ${err?.message || err}`,
        rawInputHistoricalWeatherFull: cloneForAdvisoryFlowLog(historicalWeather),
        output: { cumulativeGDD, plantGrowthActivity },
        outputFull: cloneForAdvisoryFlowLog({ cumulativeGDD, plantGrowthActivity, error: String(err?.message || err) }),
      });
    }

    const stageNameLower = (plantGrowthActivity?.stageName || "").toLowerCase();
    const isMaturityOrHarvestStage =
      stageNameLower.includes("maturity") ||
      stageNameLower.includes("harvest") ||
      (plantGrowthActivity?.bbchStage ?? 0) >= 85;

    let opticalIndicesSummary = null;
    const opticalIndexNames = selectOpticalIndicesForAdvisory({
      cropName: farmField.cropName,
      bbchStage: plantGrowthActivity?.bbchStage ?? 0,
      lightweight,
    });

    if (!opticalIndexNames.length) {
      logStep("skipping optical index snapshots (fast path)");
      flow.addStep({
        step: "optical_index_snapshots",
        notes: lightweight ? "Skipped lightweight mode" : "No indices selected",
        output: null,
      });
    } else {
      try {
        logStep(
          `fetching ${opticalIndexNames.length} optical index snapshots`,
        );
        const indexRows = await fetchOpticalIndexSnapshots(
          geometry,
          snapshotDate,
          opticalIndexNames,
        );
        opticalIndicesSummary = buildOpticalIndicesSummary(
          indexRows,
          snapshotDate,
        );
        flow.addStep({
          step: "optical_index_snapshots",
          output: {
            indexNames: opticalIndexNames,
            ok: indexRows.filter((r) => r.ok).length,
            failed: indexRows.filter((r) => !r.ok).length,
          },
        });
      } catch (err) {
        console.warn("Optical index snapshots failed:", err?.message || err);
        flow.addStep({
          step: "optical_index_snapshots",
          notes: `Failed: ${err?.message || err}`,
        });
      }
    }

    flow.addStep({
      step: "yield_stage_gate",
      service: "advisory.service",
      apiOrFn: "maturity/harvest — yield only",
      output: {
        stageName: plantGrowthActivity?.stageName,
        bbchStage: plantGrowthActivity?.bbchStage,
        isMaturityOrHarvestStage,
        note: "Full advisory runs for all stages; standard/AI yield numbers only when maturity or harvest.",
      },
    });

    const npkManagement = calculateNPKFromfarmField({
      farmField,
      ndviLatest: ndvi.ndviLatest,
      waterLatest: water.waterLatest,
      plantGrowthActivity,
      weatherSummary,
      language,
    });
    flow.addStep({
      step: "npk_management",
      service: "src/utils/npk/npkCalculator",
      apiOrFn: "calculateNPKFromfarmField",
      inputs: {
        ndviLatest: ndvi.ndviLatest,
        waterLatest: water.waterLatest,
        language,
      },
      inputsFull: cloneForAdvisoryFlowLog({
        farmFieldId: farmField._id,
        cropName: farmField.cropName,
        ndviLatest: ndvi.ndviLatest,
        waterLatest: water.waterLatest,
        plantGrowthActivity,
        weatherSummary,
        language,
      }),
      output: {
        topKeys: npkManagement && typeof npkManagement === "object" ? Object.keys(npkManagement).slice(0, 20) : [],
      },
      outputFull: cloneForAdvisoryFlowLog(npkManagement),
    });

    const cropHealth = calcCropHealth({
      ndvi,
      water,
      weatherSummary,
      plantGrowthActivity,
      npkManagement,
      farmField,
      language,
      opticalIndicesSummary,
    });
    flow.addStep({
      step: "crop_health",
      service: "src/utils/crop/health/cropHealth",
      apiOrFn: "calcCropHealth",
      inputsFull: cloneForAdvisoryFlowLog({
        ndvi,
        water,
        plantGrowthActivity,
        npkManagementSummary:
          npkManagement && typeof npkManagement === "object"
            ? { keys: Object.keys(npkManagement) }
            : null,
        farmFieldId: farmField._id,
        cropName: farmField.cropName,
        language,
        opticalIndicesSummary,
      }),
      output: {
        score: cropHealth?.score,
        percentage: cropHealth?.percentage,
        category: cropHealth?.category,
      },
      outputFull: cloneForAdvisoryFlowLog(cropHealth),
    });

    let yieldInfo = null;
    if (isMaturityOrHarvestStage) {
      yieldInfo = calculateYieldPrecise({
        farmField,
        cropHealth,
        plantGrowthActivity,
        npkManagement,
        ndvi,
        water,
        weatherSummary,
        language,
      });
    }

    const yieldSkippedExplanation =
      language === "mr"
        ? "उत्पादन अंदाज फक्त परिपक्वता/कापणी टप्प्यावर दाखवला जातो."
        : language === "hi"
          ? "उपज अनुमान केवल परिपक्वता/कटाई अवस्था में दिखाया जाता है।"
          : "Yield estimate is shown only at maturity or harvest stage.";

    const safeYield = isMaturityOrHarvestStage
      ? {
          standardYield: yieldInfo?.yield?.standardYield ?? null,
          aiYield: yieldInfo?.yield?.aiYield ?? null,
          unit: yieldInfo?.yield?.unit || "quintal",
          explanation: yieldInfo?.yield?.explanation || "",
          yieldGap: yieldInfo?.yieldGap ?? null,
        }
      : {
          standardYield: null,
          aiYield: null,
          unit: "quintal",
          explanation: yieldSkippedExplanation,
          yieldGap: null,
        };

    flow.addStep({
      step: "yield_estimate",
      service: "advisory/utils/yield/yieldCalculator",
      apiOrFn: isMaturityOrHarvestStage ? "calculateYieldPrecise" : "skipped_pre_maturity",
      inputsFull: cloneForAdvisoryFlowLog({
        farmFieldId: farmField._id,
        cropName: farmField.cropName,
        acre: farmField.acre,
        cropHealth,
        plantGrowthActivity,
        npkManagement,
        ndvi,
        water,
        weatherSummary,
        language,
        isMaturityOrHarvestStage,
      }),
      calculated: isMaturityOrHarvestStage
        ? "standard vs AI yield, gap, limiting factor"
        : "yield numbers omitted until maturity/harvest",
      output: safeYield,
      outputFull: cloneForAdvisoryFlowLog(yieldInfo),
    });

    const user = farmField.user
      ? await User.findById(farmField.user).populate("organization", "organizationCode").lean()
      : null;
    const organizationCode = String(user?.organization?.organizationCode || "").toUpperCase();

    const evidence = buildEvidence({
      farmField,
      weatherSummary,
      ndvi,
      water,
      plantGrowthActivity,
      npkManagement,
      cropHealth,
      regionProfile: farmField.regionProfile ?? {},
      yieldGap: isMaturityOrHarvestStage ? safeYield.yieldGap : null,
      opticalIndicesSummary,
      language,
    });
    flow.addStep({
      step: "evidence_and_decision_hints",
      service: "advisory/utils/evidence/evidenceBuilder",
      apiOrFn: "buildEvidence + runDecisionEngine",
      calculated: "irrigationRequirement, fertilizerSchedule, stressZones, carbonData, decisionHints",
      output: {
        evidenceKeys: Object.keys(evidence).slice(0, 25),
        decisionHintKeys: evidence.decisionHints ? Object.keys(evidence.decisionHints) : [],
        irrigationShouldIrrigate: evidence.irrigationRequirement?.shouldIrrigate,
        carbonSummary: evidence.carbonData
          ? {
              emissionKgCO2: evidence.carbonData.emissionKgCO2,
              capturedKgCO2: evidence.carbonData.capturedKgCO2,
              netBalanceKgCO2: evidence.carbonData.netBalanceKgCO2,
            }
          : null,
      },
      outputFull: cloneForAdvisoryFlowLog(evidence),
    });

    let advisoryResponse = null;
    let activitiesSource = "rules";
    try {
      logStep("generating AI advisory");
      advisoryResponse = await generateSmartAdvisory({
        language,
        evidence,
      });
      if (advisoryResponse?.activitiesToDo?.some((a) => (a?.message || "").trim())) {
        activitiesSource = "llm";
      }
      flow.addStep({
        step: "llm_advisory",
        service: "openai",
        apiOrFn: "generateSmartAdvisory",
        inputs: { language, evidenceKeyCount: Object.keys(evidence).length },
        inputsSummary: {
          evidenceTopLevelKeys: Object.keys(evidence),
          note: "Full evidence payload is on step evidence_and_decision_hints.outputFull",
        },
        output: advisoryResponse
          ? {
              activityTypes: (advisoryResponse.activitiesToDo || []).map((a) => a.type),
            }
          : null,
        outputFull: cloneForAdvisoryFlowLog(advisoryResponse),
      });
    } catch (err) {
      console.warn("LLM failed, continuing without AI advisory", err);
      flow.addStep({
        step: "llm_advisory",
        service: "openai",
        apiOrFn: "generateSmartAdvisory",
        notes: `Failed: ${err?.message || err}`,
        output: null,
        inputsSummary: {
          language,
          evidenceTopLevelKeys: Object.keys(evidence),
          note: "Full evidence on step evidence_and_decision_hints.outputFull",
        },
        outputFull: cloneForAdvisoryFlowLog({ error: String(err?.message || err) }),
      });
    }

    let activitiesToDo = advisoryResponse?.activitiesToDo ?? null;
    const hasUsableLlmActivities =
      Array.isArray(activitiesToDo) &&
      activitiesToDo.some((a) => (a?.message || "").trim().length > 10);

    const ruleBased = buildActivitiesFromDecisionHints(evidence);
    if (!hasUsableLlmActivities) {
      logStep("using agronomist rule-based activities");
      activitiesToDo = ruleBased.activitiesToDo;
      activitiesSource = advisoryResponse ? "hybrid" : "rules";
    } else if (language && language !== "en") {
      activitiesToDo = mergeLocalizedActivities(
        activitiesToDo,
        ruleBased.activitiesToDo,
        language,
      );
    }

    const carbonData = evidence?.carbonData ?? null;

    const recommendedProducts =
      organizationCode === "BIODROPS" ? [BIODROPS_BOKASHI_PRODUCT] : [];

    const advisory = await FarmAdvisory.create({
      farmFieldId: farmField._id,
      yield: safeYield,
      activitiesToDo,
      activitiesSource,
      cropHealth,
      plantGrowthActivity,
      npkManagement,
      carbonData,
      recommendedProducts,
      opticalIndicesSummary,
      weatherSnapshot,
    });
    logStep(`saved advisory ${advisory._id}`);
    flow.addStep({
      step: "persist_advisory",
      service: "mongoose",
      apiOrFn: "FarmAdvisory.create",
      inputsFull: cloneForAdvisoryFlowLog({
        farmFieldId: farmField._id,
        yield: safeYield,
        activitiesToDo: advisoryResponse?.activitiesToDo ?? null,
        cropHealth,
        plantGrowthActivity,
        npkManagement,
        carbonData,
        recommendedProducts,
        opticalIndicesSummary,
      }),
      output: {
        advisoryId: String(advisory._id),
        activitiesCount: (advisory.activitiesToDo || []).length,
      },
      outputFull: cloneForAdvisoryFlowLog(
        typeof advisory?.toObject === "function" ? advisory.toObject() : advisory,
      ),
    });

    if (carbonData && farmField.user) {
      try {
        await saveCarbonFromAdvisory({
          userId: farmField.user,
          farmFieldId: farmField._id,
          advisoryId: advisory._id,
          date: nowISO.slice(0, 10),
          carbonData,
        });
        flow.addStep({
          step: "carbon_tracking",
          service: "carbonTracking.service",
          apiOrFn: "saveCarbonFromAdvisory",
          inputsFull: cloneForAdvisoryFlowLog({
            userId: farmField.user,
            farmFieldId: farmField._id,
            advisoryId: advisory._id,
            date: nowISO.slice(0, 10),
            carbonData,
          }),
          output: { saved: true },
          outputFull: cloneForAdvisoryFlowLog(carbonData),
        });
      } catch (err) {
        console.warn("Carbon tracking save failed:", err.message);
        flow.addStep({
          step: "carbon_tracking",
          notes: `saveCarbonFromAdvisory failed: ${err.message}`,
        });
      }
    }

    flow.addStep({
      step: "load_notification_user",
      service: "mongoose",
      apiOrFn: "User.findById + populate(organization.organizationCode)",
      inputs: { userId: farmField.user != null ? String(farmField.user) : null },
      output: user
        ? {
            userId: String(user._id),
            hasEmail: Boolean(user.email),
            firstName: user.firstName,
            language: user.language,
            organizationCode: organizationCode || null,
          }
        : null,
      outputFull: user
        ? cloneForAdvisoryFlowLog({
            _id: user._id,
            firstName: user.firstName,
            email: user.email,
            language: user.language,
            phone: user.phone,
            organizationCode: organizationCode || null,
          })
        : null,
    });

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
      flow.addStep({
        step: "notification",
        service: "notificationCreator.service",
        apiOrFn: "createNotification",
        inputsFull: cloneForAdvisoryFlowLog({
          type: "ADVISORY",
          referenceId: advisory._id,
          templateName: "farm_advisory",
          parameters: notificationParameters,
          activitiesSource,
        }),
        output: { templateName: "farm_advisory", referenceId: String(advisory._id) },
      });
      flow.setOutcome({
        status: "complete",
        advisoryId: String(advisory._id),
        notified: true,
      });
      return advisory;
    }

    flow.addStep({
      step: "notification",
      notes: "Skipped: user not found for farmField.user",
    });
    flow.setOutcome({
      status: "complete_no_notification",
      advisoryId: String(advisory._id),
      notified: false,
    });
    return advisory;
  } catch (err) {
    flow.setError(err);
    throw err;
  } finally {
    await flow.writeToDisk();
  }
}
