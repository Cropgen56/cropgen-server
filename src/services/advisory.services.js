import FarmAdvisory from "../models/farmadvisory.model.js";
import FarmField from "../models/field.model.js";
import { createNotification } from "./notificationCreator.service.js";
import { saveCarbonFromAdvisory } from "./carbonTracking.service.js";
import User from "../models/user.model.js";

import {
  getCurrentWeather,
  getForecastWeather,
  getHistoricalWeather,
} from "../clients/observearth.client.js";

import {
  getVegetationTimeseries,
  getWaterTimeseries,
} from "../clients/timeseries.client.js";

import { generateSmartAdvisory } from "../utils/advisory/generateSmartAdvisory.js";
import { buildEvidence } from "../utils/advisory/evidenceBuilder.js";

import {
  formatDateISO,
  buildGeometryFromFarmField,
} from "../utils/advisory/helpers.js";

import {
  parseNDVIMetrics,
  parseWaterMetrics,
} from "../utils/advisory/calculators.js";

import {
  getBaseTemperature,
  calculateCumulativeGDD,
  getCropStage,
  getCropGrowthStage,
} from "../utils/cropgrowth/gddCalculator.js";

import { calculateNPKFromfarmField } from "../utils/npk/npkCalculator.js";
import { calcCropHealth } from "../utils/crophealth/cropHealth.js";
import { calculateYield } from "../utils/cropyield/calculateYield.js";
import { calculateYieldPrecise } from "../utils/advisory/yieldCalculator.js";

/* =========================================================
   HELPERS
========================================================= */

const ACRE_TO_HA = 0.404686;

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

/* =========================================================
   MAIN SERVICE (NO TARGET DATE)
========================================================= */

export async function generateAdvisoryForField(
  farmFieldId,
  geometryId,
  language,
  platform = "whatsapp",
) {
  /* ---------- Current Time ---------- */
  const now = new Date();
  const nowISO = formatDateISO(now);

  /* ---------- Fetch Farm Field ---------- */
  const farmField = await FarmField.findById(farmFieldId).lean();
  if (!farmField) {
    throw new Error(`FarmField not found: ${farmFieldId}`);
  }

  const sowingDateISO = formatDateISO(farmField.sowingDate || now);

  const geometry = buildGeometryFromFarmField(farmField);

  /* ---------- Weather (Parallel) ---------- */
  const [currentWeatherResp, forecastWeather, historicalWeather] =
    await Promise.all([
      getCurrentWeather(geometryId),
      getForecastWeather(geometryId),
      getHistoricalWeather(geometryId, sowingDateISO, nowISO),
    ]);

  const currentWeather = currentWeatherResp?.current || currentWeatherResp;

  /* ---------- Weather Summary ---------- */
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

  /* ---------- Satellite Data ---------- */
  const satelliteRange = limitSatelliteRange(sowingDateISO, nowISO, 90);

  const vegTs = await getVegetationTimeseries(
    geometry,
    satelliteRange.start,
    satelliteRange.end,
    "NDVI",
  );

  const ndvi = parseNDVIMetrics(vegTs);

  let water;
  try {
    const waterTs = await getWaterTimeseries(
      geometry,
      satelliteRange.start,
      satelliteRange.end,
      "NDMI",
    );
    water = parseWaterMetrics(waterTs);
  } catch {
    water = {
      waterLatest: null,
      stressLevel: "unknown",
      confidence: 0,
    };
  }

  /* ---------- GDD & Growth Stage ---------- */
  const baseTemp = getBaseTemperature(farmField.cropName);

  let cumulativeGDD = 0;
  let currentStage = "Sowing";
  let plantGrowthActivity = {
    bbchStage: 0,
    stageName: "Sowing",
    description: "Crop not yet emerged",
    overallProgress: 0,
    stageProgress: 0,
  };

  try {
    const gddSeries = calculateCumulativeGDD(historicalWeather, baseTemp);

    if (gddSeries?.length) {
      cumulativeGDD = gddSeries.at(-1)?.cumulativeGDD || 0;

      currentStage = getCropStage(farmField.cropName, cumulativeGDD);

      plantGrowthActivity = getCropGrowthStage(
        farmField.cropName,
        cumulativeGDD,
        ndvi,
      );
    }
  } catch (err) {
    console.error("GDD calculation failed:", err);
  }

  /* ---------- NPK ---------- */
  const npkManagement = calculateNPKFromfarmField({
    farmField,
    ndviLatest: ndvi.ndviLatest,
    waterLatest: water.waterLatest,
    plantGrowthActivity,
    weatherSummary,
    language,
  });

  /* ---------- Crop Health ---------- */
  const cropHealth = calcCropHealth({
    ndvi,
    water,
    weatherSummary,
    plantGrowthActivity,
    npkManagement,
    farmField,
    language,
  });

  /* ---------- Yield (precision multivariate model) ---------- */
  const yieldInfo = calculateYieldPrecise({
    farmField,
    cropHealth,
    plantGrowthActivity,
    npkManagement,
    ndvi,
    water,
    weatherSummary,
    language,
  });

  const safeYield = {
    standardYield: yieldInfo?.yield?.standardYield ?? null,
    aiYield: yieldInfo?.yield?.aiYield ?? null,
    unit: yieldInfo?.yield?.unit || "quintal",
    explanation: yieldInfo?.yield?.explanation || "",
    yieldGap: yieldInfo?.yieldGap ?? null,
  };

  /* ---------- Evidence Builder (pre-processed, no raw satellite data) ---------- */
  const evidence = buildEvidence({
    farmField,
    weatherSummary,
    ndvi,
    water,
    plantGrowthActivity,
    npkManagement,
    cropHealth,
    regionProfile: farmField.regionProfile ?? {},
    yieldGap: safeYield.yieldGap,
  });

  /* ---------- LLM Advisory ---------- */
  let advisoryResponse = null;

  try {
    advisoryResponse = await generateSmartAdvisory({
      language,
      evidence,
    });
  } catch (err) {
    console.warn("LLM failed, continuing without AI advisory", err);
  }

  /* ---------- Save Advisory ---------- */
  const carbonData = evidence?.carbonData ?? null;

  const advisory = await FarmAdvisory.create({
    farmFieldId: farmField._id,
    yield: safeYield,
    activitiesToDo: advisoryResponse?.activitiesToDo ?? null,
    cropHealth,
    plantGrowthActivity,
    npkManagement,
    carbonData,
  });

  /* ---------- Save Carbon for Farmer Profile ---------- */
  if (carbonData && farmField.user) {
    try {
      await saveCarbonFromAdvisory({
        userId: farmField.user,
        farmFieldId: farmField._id,
        advisoryId: advisory._id,
        date: nowISO.slice(0, 10),
        carbonData,
      });
    } catch (err) {
      console.warn("Carbon tracking save failed:", err.message);
    }
  }

  /* =========================================================
     CREATE NOTIFICATION (EVENT-DRIVEN)
    ========================================================= */

  // Get user from farm field
  const user = await User.findById(farmField.user).lean();

  if (user) {
    // Format advisory date based on when it was generated
    const advisoryDateObj = advisory?.createdAt
      ? new Date(advisory.createdAt)
      : new Date(nowISO);

    const advisoryDateStr = advisoryDateObj
      .toISOString()
      .slice(0, 10)
      .split("-")
      .reverse()
      .join("-");
    // Build advisory parameters safely
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
      // Use the exact WhatsApp Manager template name
      // Message template name: farm_advisory (English, Utility)
      templateName: "farm_advisory",
      parameters: [
        user.firstName || "Farmer", // {{1}} - farmer name
        advisoryDateStr, // {{2}} - advisory date (DD-MM-YYYY)
        farmField.cropName || "Crop", // {{3}} - crop
        farmField.fieldName || "Field", // {{4}} - field
        formatAreaForNotification(farmField.acre, platform), // {{5}} - area (2 decimals; ha if web, acre otherwise)
        advisoryData.spray, // {{6}} - spray advisory
        advisoryData.fertigation, // {{7}} - fertigation advisory
        advisoryData.irrigation, // {{8}} - irrigation advisory
        advisoryData.weather, // {{9}} - weather update
        advisoryData.cropRisk, // {{10}} - crop risk
        advisoryData.monitoring, // {{11}} - monitoring (template may need update)
        advisoryData.carbonUpdate, // {{12}} - carbon tracking (template may need update)
      ],
    });

    return advisory;
  }
}
