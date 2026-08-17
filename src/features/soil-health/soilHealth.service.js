import {
  getVegetationTimeseries,
  getWaterTimeseries,
  getImageAvailability,
} from "../advisory/client/satellite.client.js";
import { area as turfArea } from "@turf/turf";
import { getBiodropsRecommendations } from "../../clients/biodrops/advisory/getBiodropsRecommendations.js";
import {
  generateLlmSoilRecommendations,
  localizeOrganizationSuggestions,
} from "./soilLlmRecommendations.service.js";
import {
  CROP_COEFFICIENTS,
  DEFAULT_ORGANIZATION_CODE,
  N_FIXING_CROPS,
  SOIL_PARAMETER_RANGES,
} from "./soilHealth.constants.js";

function mapToRange(value, minValue, maxValue) {
  return value * (maxValue - minValue) + minValue;
}

function safeNormalizeIndex(raw, fallback = 0.5) {
  const n = Number(raw);
  if (Number.isNaN(n)) return fallback;
  const clamped = Math.max(-1, Math.min(1, n));
  return (clamped + 1) / 2;
}

function getTimeseriesArray(payload) {
  const series =
    payload?.timeseries ||
    payload?.data?.timeseries ||
    payload?.results ||
    (Array.isArray(payload) ? payload : []);
  return Array.isArray(series) ? series : [];
}

function getLatestTimeseriesValue(payload) {
  const arr = getTimeseriesArray(payload);
  if (!arr.length) return null;

  const parsed = arr
    .map((point) => ({
      date: String(point?.date ?? point?.timestamp ?? point?.time ?? ""),
      value: Number(
        point?.value ??
          point?.index ??
          point?.mean ??
          point?.ndvi ??
          point?.ndmi ??
          point?.ndwi ??
          point?.savi,
      ),
    }))
    .filter((p) => p.date && !Number.isNaN(p.value))
    .sort((a, b) => a.date.localeCompare(b.date));

  if (!parsed.length) return null;
  return parsed.at(-1).value;
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

function plusDays(isoDate, days) {
  const d = new Date(isoDate);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

async function fetchIndexTriplet(
  geometry,
  startDate,
  endDate,
  { provider = "aws", satellite = "s2" } = {},
) {
  const [ndviOutcome, saviOutcome, waterOutcome] = await Promise.allSettled([
    getVegetationTimeseries(geometry, startDate, endDate, "NDVI", {
      provider,
      satellite,
    }),
    getVegetationTimeseries(geometry, startDate, endDate, "SAVI", {
      provider,
      satellite,
    }),
    getWaterTimeseries(geometry, startDate, endDate, "NDMI", {
      provider,
      satellite,
    }),
  ]);

  const ndviRaw =
    ndviOutcome.status === "fulfilled"
      ? getLatestTimeseriesValue(ndviOutcome.value)
      : null;
  const saviRawFromApi =
    saviOutcome.status === "fulfilled"
      ? getLatestTimeseriesValue(saviOutcome.value)
      : null;
  const ndwiRaw =
    waterOutcome.status === "fulfilled"
      ? getLatestTimeseriesValue(waterOutcome.value)
      : null;
  const saviRaw = saviRawFromApi ?? (ndviRaw != null ? ndviRaw * 0.9 : null);

  const ndviCount =
    ndviOutcome.status === "fulfilled"
      ? getTimeseriesArray(ndviOutcome.value).length
      : 0;
  const saviCount =
    saviOutcome.status === "fulfilled"
      ? getTimeseriesArray(saviOutcome.value).length
      : 0;
  const waterCount =
    waterOutcome.status === "fulfilled"
      ? getTimeseriesArray(waterOutcome.value).length
      : 0;

  return {
    ndviOutcome,
    saviOutcome,
    waterOutcome,
    ndviRaw,
    saviRaw,
    ndwiRaw,
    ndviCount,
    saviCount,
    waterCount,
    provider,
    satellite,
    startDate,
    endDate,
  };
}

function getCropCoeff(cropName) {
  const key = String(cropName || "default")
    .toLowerCase()
    .trim();
  return CROP_COEFFICIENTS[key] || CROP_COEFFICIENTS.default;
}

function classifyValue(value, range) {
  if (value < range.min) return "Low";
  const mid = (range.min + range.max) / 2;
  if (value <= mid) return "Medium";
  return "High";
}

function formatKgHaWithFieldTotal(kgPerHa, areaHectares) {
  const perHa = Number(kgPerHa);
  const total = Number((perHa * areaHectares).toFixed(1));
  return `${perHa} kg/ha (for this field: ~${total} kg total)`;
}

function formatRangeKgHaWithFieldTotal(minKgHa, maxKgHa, areaHectares) {
  const min = Number(minKgHa);
  const max = Number(maxKgHa);
  const totalMin = Number((min * areaHectares).toFixed(1));
  const totalMax = Number((max * areaHectares).toFixed(1));
  return `${min}-${max} kg/ha (for this field: ~${totalMin}-${totalMax} kg total)`;
}

function buildFertilizerRecommendations(metrics, cropName, areaHectares) {
  const cropLabel = String(cropName || "default");
  const recommendations = [];

  if (metrics.N.classification === "Low") {
    recommendations.push(
      `Apply Urea ${formatRangeKgHaWithFieldTotal(120, 150, areaHectares)} for ${cropLabel} to improve nitrogen.`,
    );
  } else if (metrics.N.classification === "Medium") {
    recommendations.push(
      `Apply split Urea ${formatRangeKgHaWithFieldTotal(60, 100, areaHectares)} based on irrigation schedule.`,
    );
  }

  if (metrics.P.classification === "Low") {
    recommendations.push(
      `Apply DAP ${formatRangeKgHaWithFieldTotal(100, 150, areaHectares)} or SSP ${formatRangeKgHaWithFieldTotal(200, 250, areaHectares)} to raise phosphorus.`,
    );
  } else if (metrics.P.classification === "Medium") {
    recommendations.push(
      `Apply maintenance DAP ${formatRangeKgHaWithFieldTotal(50, 80, areaHectares)} near root zone.`,
    );
  }

  if (metrics.K.classification === "Low") {
    recommendations.push(
      `Apply MOP ${formatRangeKgHaWithFieldTotal(50, 100, areaHectares)} to correct potassium deficiency.`,
    );
  } else if (metrics.K.classification === "Medium") {
    recommendations.push(
      `Apply 20-20-0-13 ${formatRangeKgHaWithFieldTotal(40, 70, areaHectares)} in split doses during active growth.`,
    );
  }

  if (metrics.S.classification === "Low") {
    recommendations.push(
      `Apply Ammonium Sulphate ${formatRangeKgHaWithFieldTotal(75, 100, areaHectares)} for sulfur support.`,
    );
  }

  if (metrics.ZN.classification === "Low") {
    recommendations.push(
      `Apply Zinc Sulphate ${formatRangeKgHaWithFieldTotal(25, 50, areaHectares)} once in basal stage.`,
    );
  }

  if (metrics.B.classification === "Low") {
    recommendations.push(
      `Apply Borax ${formatRangeKgHaWithFieldTotal(1, 2, areaHectares)} in two split applications.`,
    );
  }

  if (metrics.SOC.classification !== "High") {
    recommendations.push(
      `Add FYM/compost 8-12 tons/ha (for this field: ~${(8 * areaHectares).toFixed(1)}-${(12 * areaHectares).toFixed(1)} tons total) to improve soil organic carbon.`,
    );
  }

  if (!recommendations.length) {
    recommendations.push(
      `Nutrients are balanced for this ${areaHectares.toFixed(2)} ha field; continue stage-wise fertigation and periodic soil testing.`,
    );
  }

  return recommendations;
}

async function buildOrganizationSuggestions({
  organizationCode,
  cropName,
  acreage,
  language = "en",
}) {
  const code = String(
    organizationCode || DEFAULT_ORGANIZATION_CODE,
  ).toUpperCase();
  if (code !== "BIODROPS") return [];

  const biodrops = getBiodropsRecommendations({
    cropName,
    acre: acreage,
    bbchStage: 0,
    mode: "barren",
  });

  const bokashiHint = biodrops?.productHints?.find((h) =>
    String(h.productName || "")
      .toLowerCase()
      .includes("bokashi"),
  );
  const bioTopHints = (biodrops?.productHints || []).slice(0, 4);

  const notes = [];
  if (bokashiHint) {
    notes.push(
      `${bokashiHint.productName}: ${bokashiHint.dosage}. ${bokashiHint.method}.`,
    );
  } else {
    notes.push(
      "Use Bokashi compost with biofertilizers in moist soil and irrigate lightly after application.",
    );
  }

  for (const hint of bioTopHints) {
    if (
      String(hint.productName || "")
        .toLowerCase()
        .includes("bokashi")
    )
      continue;
    notes.push(`${hint.productName}: ${hint.dosage}. ${hint.method}.`);
  }

  const base = {
    organizationCode: code,
    title: "Organization-specific suggestions",
    notes,
  };

  try {
    const localized = await localizeOrganizationSuggestions({
      title: base.title,
      notes: base.notes,
      language,
    });
    return [
      {
        ...base,
        title: localized.title,
        notes: localized.notes,
      },
    ];
  } catch {
    return [base];
  }
}

export async function generateSoilHealthReport({
  geometry,
  startDate,
  endDate,
  currentCrop = "default",
  previousCrop = "default",
  organizationCode = "",
  language = "en",
}) {
  const areaSqm = turfArea(geometry);
  const computedAcreage = Number((areaSqm / 4046.8564224).toFixed(2));
  const acreage = computedAcreage > 0 ? computedAcreage : 1;
  const areaHectares = Number((areaSqm / 10000).toFixed(4));

  let snapshotDate = endDate;
  try {
    const availability = await getImageAvailability(
      geometry,
      startDate,
      endDate,
      "sentinel",
      "s2",
    );
    snapshotDate = pickLowCloudDate(availability, endDate, 20);
  } catch {
    // Keep report generation resilient; fallback to user date range.
  }

  const fetchStartDate = plusDays(snapshotDate, -3);
  const fetchEndDate = plusDays(snapshotDate, 3);

  let attempt = await fetchIndexTriplet(
    geometry,
    fetchStartDate,
    fetchEndDate,
    {
      provider: "aws",
      satellite: "s2",
    },
  );

  // Fallback: retry wider window with provider=both if first attempt has no points.
  const zeroPointsFirstAttempt =
    attempt.ndviCount === 0 &&
    attempt.saviCount === 0 &&
    attempt.waterCount === 0;
  if (zeroPointsFirstAttempt) {
    attempt = await fetchIndexTriplet(geometry, startDate, endDate, {
      provider: "both",
      satellite: "s2",
    });
  }

  const {
    ndviOutcome,
    saviOutcome,
    waterOutcome,
    ndviRaw,
    saviRaw,
    ndwiRaw,
    ndviCount,
    saviCount,
    waterCount,
    provider: usedProvider,
    satellite: usedSatellite,
    startDate: usedStartDate,
    endDate: usedEndDate,
  } = attempt;

  if (ndviRaw == null || ndwiRaw == null || saviRaw == null) {
    const reasons = [];
    if (ndviOutcome.status === "rejected") {
      reasons.push(
        `NDVI error: ${ndviOutcome.reason?.message || ndviOutcome.reason}`,
      );
    }
    if (saviOutcome.status === "rejected") {
      reasons.push(
        `SAVI error: ${saviOutcome.reason?.message || saviOutcome.reason}`,
      );
    }
    if (waterOutcome.status === "rejected") {
      reasons.push(
        `Water index error: ${waterOutcome.reason?.message || waterOutcome.reason}`,
      );
    }
    const details = reasons.length
      ? ` ${reasons.join(" | ")}`
      : ` No satellite observations found. Timeseries counts — NDVI:${ndviCount}, SAVI:${saviCount}, NDMI:${waterCount}. Window: ${usedStartDate} to ${usedEndDate} (snapshot ${snapshotDate}, provider ${usedProvider}, satellite ${usedSatellite}).`;
    const err = new Error(
      `Satellite data unavailable for soil report.${details}`,
    );
    err.statusCode = 400;
    throw err;
  }

  const ndvi = safeNormalizeIndex(ndviRaw);
  const ndwi = safeNormalizeIndex(ndwiRaw);
  const savi = safeNormalizeIndex(saviRaw);

  let nitrogen = mapToRange(
    ndvi,
    SOIL_PARAMETER_RANGES.N.min,
    SOIL_PARAMETER_RANGES.N.max,
  );
  const phosphorus = mapToRange(
    ndwi,
    SOIL_PARAMETER_RANGES.P.min,
    SOIL_PARAMETER_RANGES.P.max,
  );
  const potassium = mapToRange(
    savi,
    SOIL_PARAMETER_RANGES.K.min,
    SOIL_PARAMETER_RANGES.K.max,
  );
  const soc = mapToRange(
    ndvi,
    SOIL_PARAMETER_RANGES.SOC.min,
    SOIL_PARAMETER_RANGES.SOC.max,
  );
  const soilMoisture = mapToRange(
    ndwi,
    SOIL_PARAMETER_RANGES.SOIL_MOISTURE.min,
    SOIL_PARAMETER_RANGES.SOIL_MOISTURE.max,
  );
  const clayContent = mapToRange(
    savi,
    SOIL_PARAMETER_RANGES.CLAY_CONTENT.min,
    SOIL_PARAMETER_RANGES.CLAY_CONTENT.max,
  );

  const ca = mapToRange(
    ndvi,
    SOIL_PARAMETER_RANGES.CA.min,
    SOIL_PARAMETER_RANGES.CA.max,
  );
  const mg = mapToRange(
    ndwi,
    SOIL_PARAMETER_RANGES.MG.min,
    SOIL_PARAMETER_RANGES.MG.max,
  );
  const s = mapToRange(
    savi,
    SOIL_PARAMETER_RANGES.S.min,
    SOIL_PARAMETER_RANGES.S.max,
  );
  const b = mapToRange(
    ndvi,
    SOIL_PARAMETER_RANGES.B.min,
    SOIL_PARAMETER_RANGES.B.max,
  );
  const zn = mapToRange(
    ndwi,
    SOIL_PARAMETER_RANGES.ZN.min,
    SOIL_PARAMETER_RANGES.ZN.max,
  );
  const cu = mapToRange(
    savi,
    SOIL_PARAMETER_RANGES.CU.min,
    SOIL_PARAMETER_RANGES.CU.max,
  );
  const fe = mapToRange(
    ndvi,
    SOIL_PARAMETER_RANGES.FE.min,
    SOIL_PARAMETER_RANGES.FE.max,
  );
  const mn = mapToRange(
    ndwi,
    SOIL_PARAMETER_RANGES.MN.min,
    SOIL_PARAMETER_RANGES.MN.max,
  );
  const cec = mapToRange(
    ndvi,
    SOIL_PARAMETER_RANGES.CEC.min,
    SOIL_PARAMETER_RANGES.CEC.max,
  );
  const ph = 6.5 + ndvi * 0.3 + ndwi * 0.5 - savi * 0.2;

  const prevCropKey = String(previousCrop || "")
    .toLowerCase()
    .trim();
  if (N_FIXING_CROPS.has(prevCropKey)) {
    nitrogen *= 0.7;
  }

  const currentCoeff = getCropCoeff(currentCrop);
  const previousCoeff = getCropCoeff(previousCrop);
  const cropAdjustment = {
    N: +((currentCoeff.N + previousCoeff.N) / 2).toFixed(2),
    P: +((currentCoeff.P + previousCoeff.P) / 2).toFixed(2),
    K: +((currentCoeff.K + previousCoeff.K) / 2).toFixed(2),
    SOC: +((currentCoeff.SOC + previousCoeff.SOC) / 2).toFixed(2),
  };

  const metrics = {
    N: {
      value: +nitrogen.toFixed(2),
      unit: SOIL_PARAMETER_RANGES.N.unit,
      classification: classifyValue(nitrogen, SOIL_PARAMETER_RANGES.N),
    },
    P: {
      value: +phosphorus.toFixed(2),
      unit: SOIL_PARAMETER_RANGES.P.unit,
      classification: classifyValue(phosphorus, SOIL_PARAMETER_RANGES.P),
    },
    K: {
      value: +potassium.toFixed(2),
      unit: SOIL_PARAMETER_RANGES.K.unit,
      classification: classifyValue(potassium, SOIL_PARAMETER_RANGES.K),
    },
    SOC: {
      value: +soc.toFixed(2),
      unit: SOIL_PARAMETER_RANGES.SOC.unit,
      classification: classifyValue(soc, SOIL_PARAMETER_RANGES.SOC),
    },
    SOIL_MOISTURE: {
      value: +soilMoisture.toFixed(2),
      unit: SOIL_PARAMETER_RANGES.SOIL_MOISTURE.unit,
      classification: classifyValue(
        soilMoisture,
        SOIL_PARAMETER_RANGES.SOIL_MOISTURE,
      ),
    },
    CLAY_CONTENT: {
      value: +clayContent.toFixed(2),
      unit: SOIL_PARAMETER_RANGES.CLAY_CONTENT.unit,
      classification: classifyValue(
        clayContent,
        SOIL_PARAMETER_RANGES.CLAY_CONTENT,
      ),
    },
    CA: {
      value: +ca.toFixed(2),
      unit: SOIL_PARAMETER_RANGES.CA.unit,
      classification: classifyValue(ca, SOIL_PARAMETER_RANGES.CA),
    },
    MG: {
      value: +mg.toFixed(2),
      unit: SOIL_PARAMETER_RANGES.MG.unit,
      classification: classifyValue(mg, SOIL_PARAMETER_RANGES.MG),
    },
    S: {
      value: +s.toFixed(2),
      unit: SOIL_PARAMETER_RANGES.S.unit,
      classification: classifyValue(s, SOIL_PARAMETER_RANGES.S),
    },
    B: {
      value: +b.toFixed(2),
      unit: SOIL_PARAMETER_RANGES.B.unit,
      classification: classifyValue(b, SOIL_PARAMETER_RANGES.B),
    },
    ZN: {
      value: +zn.toFixed(2),
      unit: SOIL_PARAMETER_RANGES.ZN.unit,
      classification: classifyValue(zn, SOIL_PARAMETER_RANGES.ZN),
    },
    CU: {
      value: +cu.toFixed(2),
      unit: SOIL_PARAMETER_RANGES.CU.unit,
      classification: classifyValue(cu, SOIL_PARAMETER_RANGES.CU),
    },
    FE: {
      value: +fe.toFixed(2),
      unit: SOIL_PARAMETER_RANGES.FE.unit,
      classification: classifyValue(fe, SOIL_PARAMETER_RANGES.FE),
    },
    MN: {
      value: +mn.toFixed(2),
      unit: SOIL_PARAMETER_RANGES.MN.unit,
      classification: classifyValue(mn, SOIL_PARAMETER_RANGES.MN),
    },
    PH: {
      value: +ph.toFixed(2),
      unit: SOIL_PARAMETER_RANGES.PH.unit,
      classification: classifyValue(ph, SOIL_PARAMETER_RANGES.PH),
    },
    CEC: {
      value: +cec.toFixed(2),
      unit: SOIL_PARAMETER_RANGES.CEC.unit,
      classification: classifyValue(cec, SOIL_PARAMETER_RANGES.CEC),
    },
  };

  const fertilizerRecommendations = buildFertilizerRecommendations(
    metrics,
    currentCrop,
    areaHectares,
  );
  let recommendationSource = "static";
  let resolvedRecommendations = fertilizerRecommendations;
  try {
    const llmRecommendations = await generateLlmSoilRecommendations({
      cropName: currentCrop,
      previousCrop,
      areaAcres: acreage,
      areaHectares,
      areaSquareMeters: Number(areaSqm.toFixed(2)),
      metrics,
      organizationCode,
      language,
    });
    if (Array.isArray(llmRecommendations) && llmRecommendations.length) {
      resolvedRecommendations = llmRecommendations;
      recommendationSource = "llm";
    }
  } catch (err) {
    // Keep soil report resilient; static recommendation remains fallback.
    console.error(
      "[soil-health] LLM recommendation fallback to static:",
      err?.message || err,
    );
  }

  const organizationSuggestions = await buildOrganizationSuggestions({
    organizationCode,
    cropName: currentCrop,
    acreage,
    language,
  });

  return {
    area: {
      squareMeters: Number(areaSqm.toFixed(2)),
      hectares: Number(areaHectares.toFixed(4)),
      acres: acreage,
    },
    satelliteContext: {
      selectedSnapshotDate: snapshotDate,
      fetchWindowStart: usedStartDate,
      fetchWindowEnd: usedEndDate,
      provider: usedProvider,
      satellite: usedSatellite,
    },
    indicesUsed: {
      ndvi: +ndviRaw.toFixed(4),
      ndwi: +ndwiRaw.toFixed(4),
      savi: +saviRaw.toFixed(4),
    },
    cropContext: {
      currentCrop,
      previousCrop,
      cropAdjustment,
      language,
    },
    soilMetrics: metrics,
    fertilizerRecommendations: resolvedRecommendations,
    recommendationSource,
    organizationSuggestions,
  };
}
