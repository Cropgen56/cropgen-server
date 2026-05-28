import axios from "axios";

const CROPGEN_TS_BASE =
  process.env.CROPGEN_TS_BASE || "https://server.cropgenapp.com/v4/api";
const REQUEST_TIMEOUT_MS = Number(process.env.SATELLITE_TIMEOUT_MS) || 45_000;

const satelliteHttp = axios.create({ timeout: REQUEST_TIMEOUT_MS });

/** Optical index names supported by `/calculate/index` (API returns legend + optional image). */
export const OPTICAL_INDEX_NAMES = [
  "NDVI",
  "EVI",
  "EVI2",
  "SAVI",
  "MSAVI",
  "NDMI",
  "NDWI",
  "SMI",
  "CCC",
  "NITROGEN",
  "SOC",
  "NDRE",
  "RECI",
  "TRUE_COLOR",
];

function getSatelliteHeaders() {
  return {
    accept: "application/json",
    "Content-Type": "application/json",
    "x-api-key": process.env.SATELLITE_API_KEY,
  };
}

export async function getVegetationTimeseries(
  geometry,
  startDate,
  endDate,
  index = "NDVI",
) {
  const url = `${CROPGEN_TS_BASE}/timeseries/vegetation/vegetation`;
  const body = {
    geometry,
    start_date: startDate,
    end_date: endDate,
    index: index.toLowerCase(),
    provider: "aws",
    satellite: "s2",
    max_items: 25,
  };
  const { data } = await satelliteHttp.post(url, body, {
    headers: getSatelliteHeaders(),
  });
  return data;
}

export async function getWaterTimeseries(
  geometry,
  startDate,
  endDate,
  index = "NDMI",
) {
  const url = `${CROPGEN_TS_BASE}/timeseries/water/water`;
  const body = {
    geometry,
    start_date: startDate,
    end_date: endDate,
    index: index.toLowerCase(),
    provider: "aws",
    satellite: "s2",
    max_items: 25,
  };
  const { data } = await satelliteHttp.post(url, body, {
    headers: getSatelliteHeaders(),
  });
  return data;
}

export async function getImageAvailability(
  geometry,
  startDate,
  endDate,
  provider = "both",
  satellite = "s2",
) {
  const url = `${CROPGEN_TS_BASE}/availability/`;
  const body = {
    geometry,
    start_date: startDate,
    end_date: endDate,
    provider,
    satellite,
  };
  const { data } = await satelliteHttp.post(url, body, {
    headers: getSatelliteHeaders(),
  });
  return data;
}

export async function calculateIndexImage(
  geometry,
  date,
  indexName = "NDVI",
  {
    provider = "both",
    satellite = "s2",
    width = 800,
    height = 800,
    supersample = 1,
    smooth = false,
    gaussianSigma = 1,
  } = {},
) {
  const url = `${CROPGEN_TS_BASE}/calculate/index`;
  const body = {
    geometry,
    date,
    index_name: indexName,
    provider,
    satellite,
    width,
    height,
    supersample,
    smooth,
    gaussian_sigma: gaussianSigma,
  };
  const { data } = await satelliteHttp.post(url, body, {
    headers: getSatelliteHeaders(),
  });
  return data;
}

export async function getNpkAvailability(
  geometry,
  date,
  { provider = "both", satellite = "s2", bbchStage = null, stageName = null } = {},
) {
  const url = `${CROPGEN_TS_BASE}/npk/availability`;
  const body = {
    geometry,
    date,
    provider,
    satellite,
    bbch_stage: bbchStage,
    stage_name: stageName,
  };
  const { data } = await satelliteHttp.post(url, body, {
    headers: getSatelliteHeaders(),
  });
  return data;
}

export async function getCropHealthScore(
  geometry,
  date,
  { sowingDate = null, provider = "both", satellite = "s2" } = {},
) {
  const url = `${CROPGEN_TS_BASE}/crop-health/score`;
  const body = {
    geometry,
    date,
    sowing_date: sowingDate,
    provider,
    satellite,
  };
  const { data } = await satelliteHttp.post(url, body, {
    headers: getSatelliteHeaders(),
  });
  return data;
}

/**
 * Calls `/calculate/index` for each index name. Failures are per-index (allSettled).
 * @returns {Promise<Array<{ indexName: string, ok: boolean, data?: object, error?: string }>>}
 */
export async function fetchOpticalIndexSnapshots(
  geometry,
  date,
  indexNames = OPTICAL_INDEX_NAMES,
  options = {},
) {
  const names = Array.isArray(indexNames) ? indexNames : OPTICAL_INDEX_NAMES;
  const settled = await Promise.allSettled(
    names.map((indexName) => calculateIndexImage(geometry, date, indexName, options)),
  );

  return settled.map((result, i) => {
    const indexName = names[i];
    if (result.status === "fulfilled") {
      return { indexName, ok: true, data: result.value };
    }
    const err = result.reason;
    return {
      indexName,
      ok: false,
      error: err?.message ? String(err.message) : String(err),
    };
  });
}
