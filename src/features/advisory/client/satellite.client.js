import axios from "axios";

const CROPGEN_TS_BASE =
  process.env.CROPGEN_TS_BASE || "https://server.cropgenapp.com/v4/api";
const REQUEST_TIMEOUT_MS = Number(process.env.SATELLITE_TIMEOUT_MS) || 45_000;
const SATELLITE_LIGHT_TIMEOUT_MS =
  Number(process.env.SATELLITE_LIGHT_TIMEOUT_MS) || 20_000;
const SATELLITE_HEAVY_TIMEOUT_MS =
  Number(process.env.SATELLITE_HEAVY_TIMEOUT_MS) || REQUEST_TIMEOUT_MS;

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
  { provider = "aws", satellite = "s2", maxItems = 25 } = {},
) {
  const url = `${CROPGEN_TS_BASE}/timeseries/vegetation/vegetation`;
  const body = {
    geometry,
    start_date: startDate,
    end_date: endDate,
    index: index.toLowerCase(),
    provider,
    satellite,
    max_items: maxItems,
  };
  const { data } = await satelliteHttp.post(url, body, {
    headers: getSatelliteHeaders(),
    timeout: SATELLITE_HEAVY_TIMEOUT_MS,
  });
  return data;
}

export async function getWaterTimeseries(
  geometry,
  startDate,
  endDate,
  index = "NDMI",
  { provider = "aws", satellite = "s2", maxItems = 25 } = {},
) {
  const url = `${CROPGEN_TS_BASE}/timeseries/water/water`;
  const body = {
    geometry,
    start_date: startDate,
    end_date: endDate,
    index: index.toLowerCase(),
    provider,
    satellite,
    max_items: maxItems,
  };
  const { data } = await satelliteHttp.post(url, body, {
    headers: getSatelliteHeaders(),
    timeout: SATELLITE_HEAVY_TIMEOUT_MS,
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
    timeout: SATELLITE_LIGHT_TIMEOUT_MS,
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
    timeout: SATELLITE_HEAVY_TIMEOUT_MS,
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
    timeout: SATELLITE_HEAVY_TIMEOUT_MS,
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
    timeout: SATELLITE_LIGHT_TIMEOUT_MS,
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

/* ------------------------------------------------------------------ *
 * Condition monitor: Sentinel-1 radar + multi-index optical series.  *
 * ------------------------------------------------------------------ */

/**
 * Sentinel-1 SAR backscatter timeseries (VV, VH) for the field polygon.
 *
 * Expected server contract (see docs/SATELLITE_API_SPEC.md):
 *   POST {CROPGEN_TS_BASE}{SATELLITE_S1_PATH}
 *   body  { geometry, start_date, end_date, satellite: "s1", polarizations: ["VV","VH"], orbit: "both" }
 *   reply { timeseries: [{ date, vv, vh, orbit? }] }   values in dB (linear also accepted)
 *
 * Returns [] when the endpoint is not deployed yet (404/501) so the monitor
 * simply skips radar checks; other errors are thrown to the caller.
 */
const S1_PATH = process.env.SATELLITE_S1_PATH || "/timeseries/sar/sar";
let s1Unavailable = false;

export function parseSarTimeseries(data) {
  const rows = data?.timeseries || data?.data?.timeseries || data?.results || (Array.isArray(data) ? data : []);
  return (Array.isArray(rows) ? rows : [])
    .map((r) => ({
      date: String(r?.date ?? r?.time ?? r?.timestamp ?? "").slice(0, 10),
      vv: r?.vv ?? r?.VV ?? r?.vv_db ?? null,
      vh: r?.vh ?? r?.VH ?? r?.vh_db ?? null,
    }))
    .filter((r) => r.date && (r.vv !== null || r.vh !== null));
}

export async function getSarTimeseries(geometry, startDate, endDate) {
  if (s1Unavailable || String(process.env.MONITOR_S1_ENABLED || "true").toLowerCase() === "false") return [];
  try {
    const { data } = await satelliteHttp.post(
      `${CROPGEN_TS_BASE}${S1_PATH}`,
      { geometry, start_date: startDate, end_date: endDate, satellite: "s1", polarizations: ["VV", "VH"], orbit: "both" },
      { headers: getSatelliteHeaders(), timeout: SATELLITE_HEAVY_TIMEOUT_MS },
    );
    return parseSarTimeseries(data);
  } catch (err) {
    const status = err?.response?.status;
    if (status === 404 || status === 501) {
      s1Unavailable = true; // stop calling until restart
      console.warn(`[Satellite] Sentinel-1 endpoint ${S1_PATH} not available (${status}) - radar checks disabled`);
      return [];
    }
    throw err;
  }
}

/**
 * Optical index series for the monitor, cloud-filtered via the shared parser.
 * NDVI / NDRE / EVI from the vegetation endpoint, NDMI from the water endpoint.
 * Each index fails independently.
 * @returns {Promise<{ series: Record<string, {date: string, value: number}[]>, errors: string[] }>}
 */
export async function getMonitorOpticalSeries(geometry, startDate, endDate, parseFn) {
  const plan = [
    ["NDVI", () => getVegetationTimeseries(geometry, startDate, endDate, "NDVI")],
    ["NDRE", () => getVegetationTimeseries(geometry, startDate, endDate, "NDRE")],
    ["EVI", () => getVegetationTimeseries(geometry, startDate, endDate, "EVI")],
    ["NDMI", () => getWaterTimeseries(geometry, startDate, endDate, "NDMI")],
  ];
  const settled = await Promise.allSettled(plan.map(([, fn]) => fn()));
  const series = {};
  const errors = [];
  settled.forEach((r, i) => {
    const name = plan[i][0];
    if (r.status === "fulfilled") {
      series[name] = parseFn(r.value)?.series || [];
    } else {
      errors.push(`${name}: ${r.reason?.message || r.reason}`);
    }
  });
  return { series, errors };
}
