import axios from "axios";
import FarmField from "../../models/field.model.js";
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

/**
 * ObservEarth paginates (50/page by default). Earlier code only read page 1,
 * so once the account passed ~50 AOIs, lookups for older farms silently
 * failed and a fresh duplicate AOI got created on every advisory run.
 * This is now only called as a one-time fallback per farm (see
 * resolveAOIForFarm's weatherAoiId cache), so paying for full pagination
 * here is cheap and keeps the match correct regardless of account size.
 */
async function fetchAllAOIs() {
  const results = [];
  let url = `${OBSERVE_EARTH_BASE_URL}?detail=false&page_size=200`;

  while (url) {
    const res = await withAoiRetry(() => aoiHttp.get(url, { headers: HEADERS }));
    const data = res.data;
    if (Array.isArray(data)) {
      results.push(...data);
      break;
    }
    results.push(...(data.results || []));
    url = data.next || null;
  }

  return results;
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

  // Fast path: already resolved and cached on the farm doc — no ObservEarth call at all.
  if (farm.weatherAoiId) {
    return { aoiId: farm.weatherAoiId, created: false };
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

  const existing = aois.find(
    (a) => a.name === aoiName || a.name === weatherName,
  );

  let aoiId;
  let created;
  if (existing) {
    aoiId = existing.id;
    created = false;
  } else {
    const geometry = buildCentroidSamplePolygon(
      farm.field,
      ADVISORY_SAMPLE_HECTARES,
    );
    aoiId = await createAOI(aoiName, geometry);
    created = true;
  }

  // Cache atomically, only if nothing else won this race in the meantime —
  // avoids two concurrent callers (cron + manual trigger) both creating an AOI.
  const claimed = await FarmField.findOneAndUpdate(
    { _id: farm._id, weatherAoiId: { $in: [null, undefined] } },
    { $set: { weatherAoiId: aoiId } },
    { new: true },
  ).select("weatherAoiId");

  if (claimed) {
    farm.weatherAoiId = aoiId;
    return { aoiId, created };
  }

  // Someone else resolved this farm's AOI first — defer to their id instead of orphaning ours.
  const winner = await FarmField.findById(farm._id).select("weatherAoiId");
  farm.weatherAoiId = winner?.weatherAoiId || aoiId;
  return { aoiId: farm.weatherAoiId, created: false };
}

export default resolveAOIForFarm;
