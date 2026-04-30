import FarmAdvisory from "../models/farmAdvisory.model.js";
import FarmField from "../../../models/field.model.js";
import { createNotification } from "../../../services/notificationCreator.service.js";
import { saveCarbonFromAdvisory } from "../../../services/carbonTracking.service.js";
import User from "../../../models/user.model.js";

import {
  getCurrentWeather,
  getForecastWeather,
  getHistoricalWeather,
} from "../clients/observearth.client.js";

import {
  getVegetationTimeseries,
  getWaterTimeseries,
  fetchOpticalIndexSnapshots,
  getImageAvailability,
  OPTICAL_INDEX_NAMES,
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

import {
  getBaseTemperature,
  calculateCumulativeGDD,
  getCropStage,
  getCropGrowthStage,
} from "../../../utils/cropgrowth/gddCalculator.js";

import { calculateNPKFromfarmField } from "../../../utils/npk/npkCalculator.js";
import { calcCropHealth } from "../../../utils/crophealth/cropHealth.js";
import { calculateYieldPrecise } from "../utils/yield/yieldCalculator.js";

const ACRE_TO_HA = 0.404686;
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
) {
  const flow = {
    addStep() {},
    setOutcome() {},
    setError() {},
    async writeToDisk() {},
  };

  try {
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
        boundaryPointCount: Array.isArray(farmField.field) ? farmField.field.length : 0,
      },
      outputFull: cloneForAdvisoryFlowLog(farmField),
    });

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

    const [currentWeatherResp, forecastWeather, historicalWeather] =
      await Promise.all([
        getCurrentWeather(geometryId),
        getForecastWeather(geometryId),
        getHistoricalWeather(geometryId, sowingDateISO, nowISO),
      ]);

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
      },
      rawApiResponsesFull: {
        currentWeather: cloneForAdvisoryFlowLog(currentWeatherResp),
        forecastWeather: cloneForAdvisoryFlowLog(forecastWeather),
        historicalWeather: cloneForAdvisoryFlowLog(historicalWeather),
      },
      calculated: "Normalized weatherSummary (current + next7Days forecast slices)",
    });

    const currentWeather = currentWeatherResp?.current || currentWeatherResp;

    const weatherSummary = {
      current: {
        temp: currentWeather?.temp,
        humidity: currentWeather?.relative_humidity,
        rainfall: currentWeather?.precipitation ?? currentWeather?.rain ?? 0,
        windSpeed: currentWeather?.wind_speed,
        et0: currentWeather?.et0_fao_evapotranspiration,
        soilMoisture_5cm: currentWeather?.soil_moisture_5cm,
        soilMoisture_15cm: currentWeather?.soil_moisture_15cm,
      },
      next7Days: {
        dates: forecastWeather?.forecast?.time?.slice(0, 7) ?? [],
        tempMean: forecastWeather?.forecast?.temp_mean?.slice(0, 7) ?? [],
        tempMax: forecastWeather?.forecast?.temp_max?.slice(0, 7) ?? [],
        tempMin: forecastWeather?.forecast?.temp_min?.slice(0, 7) ?? [],
        rainfall: forecastWeather?.forecast?.precipitation?.slice(0, 7) ?? [],
        humidity: forecastWeather?.forecast?.relative_humidity?.slice(0, 7) ?? [],
        et0: forecastWeather?.forecast?.evapotranspiration?.slice(0, 7) ?? [],
        windSpeed: forecastWeather?.forecast?.wind_speed?.slice(0, 7) ?? [],
        windGusts: forecastWeather?.forecast?.wind_gusts?.slice(0, 7) ?? [],
        cloudCover: forecastWeather?.forecast?.cloud_cover?.slice(0, 7) ?? [],
      },
    };

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

    const vegTs = await getVegetationTimeseries(
      geometry,
      satelliteRange.start,
      satelliteRange.end,
      "NDVI",
    );
    const ndvi = parseNDVIMetrics(vegTs);

    const latestVegDate =
      getLatestVegetationTimeseriesDate(vegTs) || satelliteRange.end.slice(0, 10);

    flow.addStep({
      step: "vegetation_timeseries",
      service: "cropgen_satellite",
      apiOrFn: "POST /timeseries/vegetation/vegetation (NDVI)",
      inputs: {
        geometry: summarizeGeometry(geometry),
        start_date: satelliteRange.start,
        end_date: satelliteRange.end,
        index: "ndvi",
        provider: "aws",
        satellite: "s2",
      },
      rawResponseSummary: summarizeTimeseriesPayload(vegTs),
      rawApiResponseFull: cloneForAdvisoryFlowLog(vegTs),
      calculated: "parseNDVIMetrics, getLatestVegetationTimeseriesDate",
      output: { ndvi, latestVegDate },
      outputFull: cloneForAdvisoryFlowLog({ ndvi, latestVegDate }),
    });

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

    let opticalIndicesSummary = null;
    try {
      const indexRows = await fetchOpticalIndexSnapshots(geometry, snapshotDate);
      opticalIndicesSummary = buildOpticalIndicesSummary(indexRows, snapshotDate);
      const perIndexApiLog = summarizeOpticalIndexRowsForFlow(indexRows);
      flow.addStep({
        step: "optical_index_snapshots",
        service: "cropgen_satellite",
        apiOrFn: "POST /calculate/index (per index)",
        inputs: {
          geometry: summarizeGeometry(geometry),
          date: snapshotDate,
          indexNames: [...OPTICAL_INDEX_NAMES],
          indexCountRequested: OPTICAL_INDEX_NAMES.length,
        },
        rawResponseSummary: {
          rowCount: indexRows.length,
          okCount: indexRows.filter((r) => r.ok).length,
          failCount: indexRows.filter((r) => !r.ok).length,
        },
        rawApiRowsMeta: indexRows.map((r) => ({
          indexName: r.indexName,
          ok: r.ok,
          error: r.ok ? undefined : r.error,
          dataTopKeys: r.ok && r.data && typeof r.data === "object" ? Object.keys(r.data) : [],
          hasImageBase64: Boolean(r.data?.image_base64),
          imageBase64Length:
            typeof r.data?.image_base64 === "string" ? r.data.image_base64.length : 0,
        })),
        calculated: "buildOpticalIndicesSummary (legend stats; no image_base64 in DB summary)",
        output: {
          totals: {
            requestedIndexNames: OPTICAL_INDEX_NAMES.length,
            responses: indexRows.length,
            ok: indexRows.filter((r) => r.ok).length,
            failed: indexRows.filter((r) => !r.ok).length,
          },
          /** Full per-index API outcome; image_base64 omitted (see image_base64_meta). */
          perIndexApi: perIndexApiLog,
          /** Full `buildOpticalIndicesSummary` result used downstream (no base64). */
          processedSummaryFull: opticalIndicesSummary,
        },
      });
    } catch (err) {
      console.warn("Optical index snapshots failed:", err?.message || err);
      flow.addStep({
        step: "optical_index_snapshots",
        service: "cropgen_satellite",
        notes: `Failed: ${err?.message || err}`,
        output: null,
      });
    }

    let water;
    try {
      const waterTs = await getWaterTimeseries(
        geometry,
        satelliteRange.start,
        satelliteRange.end,
        "NDMI",
      );
      water = parseWaterMetrics(waterTs);
      flow.addStep({
        step: "water_timeseries",
        service: "cropgen_satellite",
        apiOrFn: "POST /timeseries/water/water (NDMI)",
        inputs: {
          geometry: summarizeGeometry(geometry),
          start_date: satelliteRange.start,
          end_date: satelliteRange.end,
          index: "ndmi",
        },
        rawResponseSummary: summarizeTimeseriesPayload(waterTs),
        rawApiResponseFull: cloneForAdvisoryFlowLog(waterTs),
        calculated: "parseWaterMetrics",
        output: water,
        outputFull: cloneForAdvisoryFlowLog(water),
      });
    } catch {
      water = {
        waterLatest: null,
        stressLevel: "unknown",
        confidence: 0,
      };
      flow.addStep({
        step: "water_timeseries",
        service: "cropgen_satellite",
        notes: "Request failed; using placeholder water object",
        output: water,
        outputFull: cloneForAdvisoryFlowLog(water),
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
    };

    let gddSeries = null;
    try {
      gddSeries = calculateCumulativeGDD(historicalWeather, baseTemp);
      if (gddSeries?.length) {
        cumulativeGDD = gddSeries.at(-1)?.cumulativeGDD || 0;
        getCropStage(farmField.cropName, cumulativeGDD);
        plantGrowthActivity = getCropGrowthStage(
          farmField.cropName,
          cumulativeGDD,
          ndvi,
        );
      }
      flow.addStep({
        step: "gdd_crop_growth",
        service: "src/utils/cropgrowth/gddCalculator",
        apiOrFn: "calculateCumulativeGDD + getCropGrowthStage",
        inputs: { cropName: farmField.cropName, baseTemp },
        rawResponseSummary: { gddSeriesLength: gddSeries?.length ?? 0 },
        rawInputHistoricalWeatherFull: cloneForAdvisoryFlowLog(historicalWeather),
        rawSeriesFull: gddSeries ? cloneForAdvisoryFlowLog(gddSeries) : null,
        calculated: "cumulativeGDD, plantGrowthActivity (BBCH, progress, stage name)",
        output: { cumulativeGDD, plantGrowthActivity },
        outputFull: cloneForAdvisoryFlowLog({ cumulativeGDD, plantGrowthActivity, ndviInputs: ndvi }),
      });
    } catch (err) {
      console.error("GDD calculation failed:", err);
      flow.addStep({
        step: "gdd_crop_growth",
        notes: `Failed: ${err?.message || err}`,
        rawInputHistoricalWeatherFull: cloneForAdvisoryFlowLog(historicalWeather),
        rawSeriesFull: gddSeries ? cloneForAdvisoryFlowLog(gddSeries) : null,
        output: { cumulativeGDD, plantGrowthActivity },
        outputFull: cloneForAdvisoryFlowLog({ cumulativeGDD, plantGrowthActivity, error: String(err?.message || err) }),
      });
    }

    const stageNameLower = (plantGrowthActivity?.stageName || "").toLowerCase();
    const isMaturityOrHarvestStage =
      stageNameLower.includes("maturity") ||
      stageNameLower.includes("harvest") ||
      (plantGrowthActivity?.bbchStage ?? 0) >= 85;

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
      service: "src/utils/crophealth/cropHealth",
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
    try {
      advisoryResponse = await generateSmartAdvisory({
        language,
        evidence,
      });
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

    const carbonData = evidence?.carbonData ?? null;

    const advisory = await FarmAdvisory.create({
      farmFieldId: farmField._id,
      yield: safeYield,
      activitiesToDo: advisoryResponse?.activitiesToDo ?? null,
      cropHealth,
      plantGrowthActivity,
      npkManagement,
      carbonData,
      opticalIndicesSummary,
    });
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

    const user = await User.findById(farmField.user).lean();
    flow.addStep({
      step: "load_notification_user",
      service: "mongoose",
      apiOrFn: "User.findById",
      inputs: { userId: farmField.user != null ? String(farmField.user) : null },
      output: user
        ? {
            userId: String(user._id),
            hasEmail: Boolean(user.email),
            firstName: user.firstName,
            language: user.language,
          }
        : null,
      outputFull: user
        ? cloneForAdvisoryFlowLog({
            _id: user._id,
            firstName: user.firstName,
            email: user.email,
            language: user.language,
            phone: user.phone,
          })
        : null,
    });

    if (user) {
      const advisoryDateObj = advisory?.createdAt
        ? new Date(advisory.createdAt)
        : new Date(nowISO);
      const advisoryDateStr = advisoryDateObj
        .toISOString()
        .slice(0, 10)
        .split("-")
        .reverse()
        .join("-");

      const advisoryData = {
        spray: "No spray advisory.",
        fertigation: "No fertigation advisory.",
        irrigation: "No irrigation advisory.",
        weather: "No weather update.",
        cropRisk: "No crop risk alert.",
        monitoring: "No monitoring advice.",
        carbonUpdate: "No carbon update.",
      };

      (advisory.activitiesToDo || []).forEach((activity) => {
        switch (activity.type) {
          case "SPRAY":
            advisoryData.spray = activity.message;
            break;
          case "FERTIGATION":
            advisoryData.fertigation = activity.message;
            break;
          case "IRRIGATION":
            advisoryData.irrigation = activity.message;
            break;
          case "WEATHER":
            advisoryData.weather = activity.message;
            break;
          case "CROP_RISK":
            advisoryData.cropRisk = activity.message;
            break;
          case "MONITORING":
            advisoryData.monitoring = activity.message;
            break;
          case "CARBON_TRACKING":
            advisoryData.carbonUpdate = activity.message;
            break;
        }
      });

      await createNotification({
        user,
        type: "ADVISORY",
        referenceId: advisory._id,
        templateName: "farm_advisory",
        parameters: [
          user.firstName || "Farmer",
          advisoryDateStr,
          farmField.cropName || "Crop",
          farmField.fieldName || "Field",
          formatAreaForNotification(farmField.acre, platform),
          advisoryData.spray,
          advisoryData.fertigation,
          advisoryData.irrigation,
          advisoryData.weather,
          advisoryData.cropRisk,
          advisoryData.monitoring,
          advisoryData.carbonUpdate,
        ],
      });
      flow.addStep({
        step: "notification",
        service: "notificationCreator.service",
        apiOrFn: "createNotification",
        inputsFull: cloneForAdvisoryFlowLog({
          type: "ADVISORY",
          referenceId: advisory._id,
          templateName: "farm_advisory",
          parameters: [
            user.firstName || "Farmer",
            advisoryDateStr,
            farmField.cropName || "Crop",
            farmField.fieldName || "Field",
            formatAreaForNotification(farmField.acre, platform),
            advisoryData.spray,
            advisoryData.fertigation,
            advisoryData.irrigation,
            advisoryData.weather,
            advisoryData.cropRisk,
            advisoryData.monitoring,
            advisoryData.carbonUpdate,
          ],
        }),
        output: { templateName: "farm_advisory", referenceId: String(advisory._id) },
        outputFull: cloneForAdvisoryFlowLog(advisoryData),
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
