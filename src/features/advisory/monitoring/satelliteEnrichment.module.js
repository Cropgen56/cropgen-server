import {
  getVegetationTimeseries,
  getWaterTimeseries,
  fetchOpticalIndexSnapshots,
  getImageAvailability,
  getCropHealthScore,
} from "../client/satellite.client.js";
import {
  parseNDVIMetrics,
  parseWaterMetrics,
  getLatestVegetationTimeseriesDate,
  buildOpticalIndicesSummary,
} from "../utils/satellite/index.js";
import { selectOpticalIndicesForAdvisory } from "../utils/agronomy/opticalIndexSelection.js";
import { formatDateISO } from "../utils/shared/helpers.js";
import { MODULE_IDS } from "../pipeline/constants.js";
import { moduleResult } from "../pipeline/moduleResult.js";

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

function limitRangeEndDaysBack(endISO, daysBack = 45) {
  const end = new Date(endISO);
  const start = new Date(end);
  start.setDate(start.getDate() - daysBack);
  return { start: formatDateISO(start), end: endISO };
}

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

async function runSatelliteOpticalPass(ctx, prior, warnings) {
  const geometry = ctx.geometry;
  const plantGrowthActivity = ctx.modules.gddBbch?.data?.plantGrowthActivity;
  const opticalIndexNames = selectOpticalIndicesForAdvisory({
    cropName: ctx.farmFieldDoc.cropName,
    bbchStage: plantGrowthActivity?.bbchStage ?? 0,
    lightweight: ctx.lightweight,
  });

  let opticalIndicesSummary = prior.opticalIndicesSummary ?? null;
  if (!opticalIndexNames.length) {
    ctx.logStep("satellite module (optical pass): skipped");
    return moduleResult(
      MODULE_IDS.SATELLITE,
      { ...prior, opticalIndicesSummary },
      { warnings },
    );
  }

  try {
    ctx.logStep(
      `satellite module (optical pass): ${opticalIndexNames.length} indices`,
    );
    const opticalStartedAt = Date.now();
    const indexRows = await fetchOpticalIndexSnapshots(
      geometry,
      prior.snapshotDate,
      opticalIndexNames,
    );
    ctx.logStep(
      `satellite module (optical pass): completed in ${Date.now() - opticalStartedAt}ms`,
    );
    opticalIndicesSummary = buildOpticalIndicesSummary(
      indexRows,
      prior.snapshotDate,
    );
  } catch (err) {
    warnings.push(`optical indices: ${err?.message || err}`);
  }

  return moduleResult(
    MODULE_IDS.SATELLITE,
    { ...prior, opticalIndicesSummary },
    { warnings },
  );
}

export async function runSatelliteEnrichmentModule(ctx) {
  const warnings = [];
  const geometry = ctx.geometry;
  const prior = ctx.modules.satelliteEnrichment?.data;
  const isOpticalPass =
    ctx.mode === "crop" &&
    Boolean(prior?.ndvi) &&
    Boolean(ctx.modules.gddBbch?.data?.plantGrowthActivity);

  if (isOpticalPass) return runSatelliteOpticalPass(ctx, prior, warnings);

  if (!geometry) {
    return moduleResult(
      MODULE_IDS.SATELLITE,
      {
        ndvi: { ndviLatest: null, ndviMean: null, trend: 0, values: [] },
        water: { waterLatest: null, waterMean: null, stressLevel: "unknown", confidence: 0 },
        opticalIndicesSummary: null,
        snapshotDate: null,
      },
      { warnings: ["invalid field geometry"] },
    );
  }

  const satelliteRange =
    ctx.mode === "barren"
      ? limitRangeEndDaysBack(ctx.nowISO, 14)
      : limitSatelliteRange(ctx.sowingDateISO, ctx.nowISO, 90);

  let ndvi = { ndviLatest: null, ndviMean: null, trend: 0, ndviTrend: 0, values: [] };
  let latestVegDate = satelliteRange.end.slice(0, 10);
  let water = {
    waterLatest: null,
    waterMean: null,
    stressLevel: "unknown",
    confidence: 0,
  };
  let cropHealthSignal = null;

  if (ctx.mode === "barren" && ctx.lightweight) {
    ctx.logStep("satellite module (barren lightweight): skipped");
    return moduleResult(MODULE_IDS.SATELLITE, {
      ndvi,
      water,
      opticalIndicesSummary: null,
      snapshotDate: latestVegDate,
      satelliteRange,
    });
  }

  ctx.logStep(
    `satellite module: NDVI + NDMI timeseries${
      ctx.geometryMeta?.sampled
        ? ` (${ctx.geometryMeta.sampleHa}ha centroid sample)`
        : ""
    }`,
  );
  const timeseriesStartedAt = Date.now();
  const [vegOutcome, waterOutcome] = await Promise.allSettled([
    getVegetationTimeseries(geometry, satelliteRange.start, satelliteRange.end, "NDVI"),
    getWaterTimeseries(geometry, satelliteRange.start, satelliteRange.end, "NDMI"),
  ]);

  if (vegOutcome.status === "fulfilled") {
    ndvi = parseNDVIMetrics(vegOutcome.value);
    latestVegDate =
      getLatestVegetationTimeseriesDate(vegOutcome.value) || latestVegDate;
  } else {
    warnings.push(
      `vegetation timeseries: ${vegOutcome.reason?.message || vegOutcome.reason}`,
    );
  }

  if (waterOutcome.status === "fulfilled") {
    water = parseWaterMetrics(waterOutcome.value);
  } else {
    warnings.push(
      `water timeseries: ${waterOutcome.reason?.message || waterOutcome.reason}`,
    );
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
  } catch (err) {
    warnings.push(`availability: ${err?.message || err}`);
  }

  if (ctx.mode === "crop") {
    try {
      cropHealthSignal = await getCropHealthScore(geometry, snapshotDate, {
        sowingDate: ctx.sowingDateISO,
        provider: "both",
        satellite: "s2",
      });
    } catch (err) {
      warnings.push(`crop health score: ${err?.message || err}`);
    }
  }

  if (ctx.mode === "crop") {
    ctx.logStep(
      `satellite module: timeseries complete in ${Date.now() - timeseriesStartedAt}ms (optical after hybrid GDD)`,
    );
  }

  return moduleResult(
    MODULE_IDS.SATELLITE,
    {
      ndvi,
      water,
      opticalIndicesSummary: null,
      cropHealthSignal,
      snapshotDate,
      satelliteRange,
    },
    { warnings },
  );
}
