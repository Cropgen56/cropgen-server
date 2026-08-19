import axios from "axios";
import {
  ADVISORY_SAMPLE_HECTARES,
  buildCentroidSamplePolygon,
} from "../geometry/farmGeometry.js";

const OBSERVE_EARTH_BASE_URL = "https://observearth.com/api/geometry/";
const OBSERVE_EARTH_API_KEY =
  process.env.OBSERVEARTH_API_KEY || "5b97d3f0-a01a-490b-aad1-3bfa848309f2";

if (!OBSERVE_EARTH_API_KEY) {
  throw new Error("OBSERVE_EARTH_API_KEY is not set");
}

const HEADERS = {
  "X-API-Key": OBSERVE_EARTH_API_KEY,
  "Content-Type": "application/json",
};

const AOI_TIMEOUT_MS = Number(process.env.AOI_TIMEOUT_MS) || 12_000;
const AOI_MAX_ATTEMPTS = Math.max(1, Number(process.env.AOI_MAX_ATTEMPTS) || 2);

const aoiHttp = axios.create({ timeout: AOI_TIMEOUT_MS });

/* ===================== HELPERS ===================== */

function compactAoiName(farmId) {
  return `${farmId}-wx`;
}

async function fetchAllAOIs() {
  const res = await withAoiRetry(() =>
    aoiHttp.get(`${OBSERVE_EARTH_BASE_URL}?detail=false`, {
      headers: HEADERS,
    }),
  );

  return Array.isArray(res.data) ? res.data : res.data.results || [];
}

async function createAOI(name, geometry) {
  const res = await withAoiRetry(() =>
    aoiHttp.post(
      OBSERVE_EARTH_BASE_URL,
      { name, geometry },
      { headers: HEADERS },
    ),
  );

  return res.data.id;
}

function formatAoiError(error) {
  const status = error?.response?.status;
  const data = error?.response?.data;
  const detail =
    data?.detail ||
    data?.message ||
    data?.error ||
    (typeof data === "string" ? data : null) ||
    error?.message ||
    "Unknown AOI error";
  const detailStr =
    typeof detail === "object" ? JSON.stringify(detail) : String(detail);
  return status ? `status=${status} ${detailStr}` : detailStr;
}

async function withAoiRetry(fn) {
  let lastError = null;
  for (let attempt = 1; attempt <= AOI_MAX_ATTEMPTS; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const status = Number(error?.response?.status) || 0;
      const retryable =
        error?.code === "ECONNABORTED" ||
        status === 429 ||
        status >= 500;
      if (!retryable || attempt >= AOI_MAX_ATTEMPTS) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
    }
  }
  throw lastError;
}

/* ===================== MAIN FUNCTION ===================== */

export async function resolveAOIForFarm(farm) {
  if (!farm || !farm._id) {
    throw new Error("Farm is required to resolve AOI");
  }

  const aoiName = farm._id.toString();
  const weatherName = compactAoiName(aoiName);

  let aois = [];
  try {
    aois = await fetchAllAOIs();
  } catch (listErr) {
    console.warn(
      `[Advisory] AOI list failed for farm ${aoiName}; trying direct create (${formatAoiError(
        listErr,
      )})`,
    );
  }

  if (aois.length) {
    const existing = aois.find(
      (a) => a.name === aoiName || a.name === weatherName,
    );
    if (existing) {
      return {
        aoiId: existing.id,
        created: false,
      };
    }
  }

  const geometry = buildCentroidSamplePolygon(
    farm.field,
    ADVISORY_SAMPLE_HECTARES,
  );
  const aoiId = await createAOI(aoiName, geometry);

  return {
    aoiId,
    created: true,
  };
}

export default resolveAOIForFarm;
