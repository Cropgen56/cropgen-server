import { BBCH_STAGE_MAP } from "../../../utils/crop/growth/bbchStageMap.js";
import { CROP_CATEGORY_MAP } from "../../../utils/crop/growth/cropCategoryMap.js";
import {
  calculateCumulativeGDD,
  getBaseTemperature,
  getCropGrowthStage,
  normalizeCropName,
} from "../../../utils/crop/growth/gddCalculator.js";
import {
  estimateGDDFromCurrentAndForecast,
} from "../utils/weather/gddFromWeatherSummary.js";
import { formatDateISO } from "../utils/shared/helpers.js";
import { GDD_MAX_TEMP_CAP_C } from "./constants.js";

/** Typical season length (days after sowing) by crop category — for calendar stage. */
const CATEGORY_SEASON_DAYS = {
  cereal: 125,
  pulse: 105,
  oilseed: 110,
  vegetable: 80,
  fruit: 200,
  default: 100,
};

/** NDVI phenology phase → relative position in season (0–1). */
const NDVI_PHASE_POSITION = {
  pre_emergence: 0.05,
  emergence: 0.15,
  vegetative: 0.4,
  peak: 0.72,
  senescence: 0.85,
  mature: 0.95,
  unknown: 0.5,
};

function daysBetween(startISO, endISO) {
  const start = new Date(startISO);
  const end = new Date(endISO);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
  return Math.max(0, Math.floor((end - start) / 86400000));
}

function getCategory(cropName) {
  const key = normalizeCropName(cropName);
  return CROP_CATEGORY_MAP[key] || "vegetable";
}

function buildStageCalendarProfiles(category) {
  const stages = BBCH_STAGE_MAP[category] || BBCH_STAGE_MAP.vegetable;
  const totalGdd = stages[stages.length - 1].max;
  const totalDays = CATEGORY_SEASON_DAYS[category] ?? CATEGORY_SEASON_DAYS.default;
  let prevMaxGdd = 0;

  return stages.map((stage) => {
    const minDays = Math.floor((prevMaxGdd / totalGdd) * totalDays);
    const maxDays = Math.ceil((stage.max / totalGdd) * totalDays);
    prevMaxGdd = stage.max;
    return { ...stage, minDays, maxDays };
  });
}

/**
 * Infer field phenology from NDVI time series curve.
 * @param {{ date: string, value: number }[]} series
 */
export function analyzeNdviPhenology(series) {
  if (!Array.isArray(series) || series.length < 2) {
    return {
      phase: "unknown",
      confidence: 0,
      peakNdvi: null,
      dropFromPeak: 0,
      observationCount: series?.length ?? 0,
    };
  }

  const values = series.map((p) => p.value);
  const peakNdvi = Math.max(...values);
  const latest = values.at(-1);
  const maxIdx = values.indexOf(peakNdvi);
  const dropFromPeak =
    peakNdvi > 0.05 ? Math.max(0, (peakNdvi - latest) / peakNdvi) : 0;

  const n = values.length;
  const recentSlope =
    n >= 3 ? (values.at(-1) - values.at(-3)) / 2 : values.at(-1) - values[0];

  let phase = "unknown";
  let confidence = 0.35;

  if (peakNdvi < 0.22 && latest < 0.25) {
    phase = "pre_emergence";
    confidence = 0.55;
  } else if (dropFromPeak >= 0.28 && peakNdvi >= 0.35) {
    phase = "mature";
    confidence = 0.85;
  } else if (dropFromPeak >= 0.12 && maxIdx < n - 1) {
    phase = "senescence";
    confidence = 0.75;
  } else if (maxIdx >= n - 2 && latest >= peakNdvi * 0.9 && peakNdvi >= 0.4) {
    phase = "peak";
    confidence = 0.8;
  } else if (latest >= 0.32 && recentSlope > 0.02 && maxIdx > 0) {
    phase = "vegetative";
    confidence = 0.7;
  } else if (latest < 0.38 && recentSlope > 0.03) {
    phase = "emergence";
    confidence = 0.65;
  } else if (latest >= 0.3) {
    phase = "vegetative";
    confidence = 0.6;
  }

  if (n >= 6) confidence = Math.min(0.95, confidence + 0.1);
  if (n >= 10) confidence = Math.min(0.98, confidence + 0.05);

  return {
    phase,
    confidence,
    peakNdvi: Number(peakNdvi.toFixed(3)),
    latestNdvi: Number(latest.toFixed(3)),
    dropFromPeak: Number(dropFromPeak.toFixed(3)),
    observationCount: n,
    recentSlope: Number(recentSlope.toFixed(4)),
  };
}

function stageFromGdd(cropName, cumulativeGDD, ndvi) {
  return getCropGrowthStage(cropName, cumulativeGDD, ndvi);
}

function stageFromCalendar(cropName, cropAgeDays) {
  const category = getCategory(cropName);
  const profiles = buildStageCalendarProfiles(category);
  const stage =
    profiles.find((s) => cropAgeDays <= s.maxDays) || profiles[profiles.length - 1];

  const totalDays = CATEGORY_SEASON_DAYS[category] ?? CATEGORY_SEASON_DAYS.default;
  const overallProgress = Math.min(100, (cropAgeDays / totalDays) * 100);

  const daySpan = stage.maxDays - stage.minDays;
  const stageProgress =
    daySpan > 0
      ? Math.max(0, Math.min(100, ((cropAgeDays - stage.minDays) / daySpan) * 100))
      : 100;

  return {
    bbchStage: stage.bbch,
    stageName: stage.stage,
    description: stage.description,
    overallProgress: Number(overallProgress.toFixed(1)),
    stageProgress: Number(stageProgress.toFixed(1)),
    source: "calendar",
    expectedDurationDays: totalDays,
  };
}

function stageFromNdviPhenology(cropName, phenology) {
  const category = getCategory(cropName);
  const stages = BBCH_STAGE_MAP[category] || BBCH_STAGE_MAP.vegetable;
  const position = NDVI_PHASE_POSITION[phenology.phase] ?? 0.5;
  const totalGdd = stages[stages.length - 1].max;
  const targetGdd = position * totalGdd;

  let current = stages[0];
  for (const s of stages) {
    if (targetGdd <= s.max) {
      current = s;
      break;
    }
    current = s;
  }

  const idx = stages.indexOf(current);
  const prevMax = idx > 0 ? stages[idx - 1].max : 0;
  const stageRange = current.max - prevMax || 1;
  const stageProgress = Math.max(
    0,
    Math.min(100, ((targetGdd - prevMax) / stageRange) * 100),
  );

  return {
    bbchStage: current.bbch,
    stageName: current.stage,
    description: `${current.description} (satellite phenology: ${phenology.phase})`,
    overallProgress: Number((position * 100).toFixed(1)),
    stageProgress: Number(stageProgress.toFixed(1)),
    source: "ndvi_phenology",
    ndviPhase: phenology.phase,
  };
}

function snapToStage(category, bbchTarget) {
  const stages = BBCH_STAGE_MAP[category] || BBCH_STAGE_MAP.vegetable;
  let best = stages[0];
  let bestDist = Math.abs(best.bbch - bbchTarget);
  for (const s of stages) {
    const d = Math.abs(s.bbch - bbchTarget);
    if (d < bestDist) {
      best = s;
      bestDist = d;
    }
  }
  return best;
}

function fuseStages({
  cropName,
  cropAgeDays,
  cumulativeGDD,
  gddStage,
  calendarStage,
  ndviStage,
  phenology,
  gddSource,
}) {
  const category = getCategory(cropName);
  const stages = BBCH_STAGE_MAP[category] || BBCH_STAGE_MAP.vegetable;
  const totalGdd = stages[stages.length - 1].max;

  let wGdd = 0.35;
  let wCal = 0.2;
  let wNdvi = 0.45;

  if (phenology.confidence < 0.5 || phenology.phase === "unknown") {
    wNdvi = 0.1;
    wGdd = 0.5;
    wCal = 0.4;
  }

  if (gddSource === "historical") {
    wGdd += 0.1;
    wCal -= 0.05;
  } else if (gddSource === "current_forecast_estimate") {
    wGdd -= 0.15;
    wCal += 0.1;
    if (phenology.confidence >= 0.6) wNdvi += 0.1;
  }

  const sum = wGdd + wCal + wNdvi;
  wGdd /= sum;
  wCal /= sum;
  wNdvi /= sum;

  const fusedBbch = Math.round(
    gddStage.bbchStage * wGdd +
      calendarStage.bbchStage * wCal +
      ndviStage.bbchStage * wNdvi,
  );

  const snapped = snapToStage(category, fusedBbch);
  const idx = stages.findIndex((s) => s.bbch === snapped.bbch);
  const prevMax = idx > 0 ? stages[idx - 1].max : 0;

  const overallProgress = Math.min(
    100,
    Math.max(
      gddStage.overallProgress * wGdd +
        calendarStage.overallProgress * wCal +
        ndviStage.overallProgress * wNdvi,
      (cumulativeGDD / totalGdd) * 100,
    ),
  );

  const stageRange = snapped.max - prevMax || 1;
  const stageProgress = Math.max(
    0,
    Math.min(100, ((cumulativeGDD - prevMax) / stageRange) * 100),
  );

  const signalsAgree =
    Math.abs(gddStage.bbchStage - calendarStage.bbchStage) <= 20 ||
    Math.abs(ndviStage.bbchStage - gddStage.bbchStage) <= 25;

  const stageConfidence = Math.min(
    0.98,
    (phenology.confidence * wNdvi +
      (gddSource === "historical" ? 0.85 : 0.55) * wGdd +
      0.7 * wCal) *
      (signalsAgree ? 1.05 : 0.92),
  );

  return {
    bbchStage: snapped.bbch,
    stageName: snapped.stage,
    description: snapped.description,
    cumulativeGDD,
    overallProgress: Number(overallProgress.toFixed(1)),
    stageProgress: Number(stageProgress.toFixed(1)),
    cropAgeDays,
    stageConfidence: Number(stageConfidence.toFixed(2)),
    stageFusionMethod: "hybrid_gdd_calendar_ndvi",
    gddSource,
    ndviPhenologyPhase: phenology.phase,
    signals: {
      gdd: {
        bbchStage: gddStage.bbchStage,
        stageName: gddStage.stageName,
        weight: Number(wGdd.toFixed(2)),
      },
      calendar: {
        bbchStage: calendarStage.bbchStage,
        stageName: calendarStage.stageName,
        weight: Number(wCal.toFixed(2)),
      },
      ndvi: {
        bbchStage: ndviStage.bbchStage,
        stageName: ndviStage.stageName,
        phase: phenology.phase,
        weight: Number(wNdvi.toFixed(2)),
      },
    },
  };
}

function resolveGddSeries({
  historicalWeather,
  weatherSummary,
  baseTemp,
  sowingDateISO,
  endDateISO,
}) {
  const gddOptions = { maxTempCap: GDD_MAX_TEMP_CAP_C };
  const historicalSeries = calculateCumulativeGDD(
    historicalWeather,
    baseTemp,
    sowingDateISO,
    gddOptions,
  );

  if (historicalSeries?.length) {
    return {
      gddSeries: historicalSeries,
      cumulativeGDD: historicalSeries.at(-1)?.cumulativeGDD ?? 0,
      gddSource: "historical",
      gddMeta: { method: "observearth_historical_capped", maxTempCap: GDD_MAX_TEMP_CAP_C },
    };
  }

  const estimate = estimateGDDFromCurrentAndForecast(
    weatherSummary,
    baseTemp,
    sowingDateISO,
    endDateISO,
  );

  if (estimate.gddSeries?.length) {
    return {
      gddSeries: estimate.gddSeries,
      cumulativeGDD: estimate.cumulativeGDD,
      gddSource: estimate.source,
      gddMeta: { ...estimate, maxTempCap: GDD_MAX_TEMP_CAP_C },
    };
  }

  return {
    gddSeries: [],
    cumulativeGDD: 0,
    gddSource: "none",
    gddMeta: { method: "unavailable" },
  };
}

/**
 * Hybrid crop stage: sowing date (DAE) + capped GDD + NDVI time-series phenology -> fused BBCH.
 */
export function resolveHybridCropStage({
  cropName,
  sowingDateISO,
  endDateISO = formatDateISO(new Date()),
  historicalWeather,
  weatherSummary,
  ndvi = null,
}) {
  const baseTemp = getBaseTemperature(cropName);
  const cropAgeDays = daysBetween(sowingDateISO, endDateISO);

  const { gddSeries, cumulativeGDD, gddSource, gddMeta } = resolveGddSeries({
    historicalWeather,
    weatherSummary,
    baseTemp,
    sowingDateISO,
    endDateISO,
  });

  const ndviSeries = ndvi?.series?.length
    ? ndvi.series
    : (ndvi?.values || []).map((v, i) => ({ date: `t${i}`, value: v }));

  const phenology = analyzeNdviPhenology(ndviSeries);
  const gddStage = stageFromGdd(cropName, cumulativeGDD, ndvi);
  const calendarStage = stageFromCalendar(cropName, cropAgeDays);
  const ndviStage = stageFromNdviPhenology(cropName, phenology);

  const plantGrowthActivity = fuseStages({
    cropName,
    cropAgeDays,
    cumulativeGDD,
    gddStage,
    calendarStage,
    ndviStage,
    phenology,
    gddSource,
  });

  return {
    plantGrowthActivity,
    cumulativeGDD,
    cropAgeDays,
    gddSeries,
    gddSource,
    gddMeta,
    phenology,
    calendarStage,
    gddStage,
    ndviStage,
  };
}
