import axios from "axios";
import FarmField from "../../models/field.model.js";
import {
  ADVISORY_SAMPLE_HECTARES,
  buildCentroidSamplePolygon,
} from "../geometry/farmGeometry.js";

const OBSERVE_EARTH_BASE_URL = "https://observearth.com/api/geometry/";
/**
 * Read at call time, not at import: index.js loads .env after its imports run.
 * The key is never stored in source.
 */
function aoiHeaders() {
  const key = process.env.OBSERVEARTH_API_KEY;
  if (!key) {
    throw new Error("OBSERVEARTH_API_KEY is not set (add it to .env)");
  }
  return { "X-API-Key": key, "Content-Type": "application/json" };
}

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
    const res = await withAoiRetry(() => aoiHttp.get(url, { headers: aoiHeaders() }));
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
      { headers: aoiHeaders() },
    ),
  );

  return res.data.id;
}

/**
 * true  = the AOI exists
 * false = ObservEarth says it does not (it answers HTTP 500 with
 *         "No Geometry matches the given query." for a missing AOI)
 * null  = could not tell (network or other error); callers keep the stored id
 */
async function aoiExists(aoiId) {
  try {
    await withAoiRetry(() =>
      aoiHttp.get(`${OBSERVE_EARTH_BASE_URL}${aoiId}/`, { headers: aoiHeaders() }),
    );
    return true;
  } catch (error) {
    const status = Number(error?.response?.status) || 0;
    const message = JSON.stringify(error?.response?.data || "");
    if (status === 404) return false;
    if (status === 500 && message.includes("No Geometry matches")) return false;
    console.warn(
      `[Advisory] could not verify AOI ${aoiId} (${formatAoiError(error)}); using stored id`,
    );
    return null;
  }
}

/** All AOIs on the ObservEarth account (summary: id, name, area). */
export async function listAois() {
  return fetchAllAOIs();
}

/** Delete one AOI on ObservEarth. A 404 means it is already gone. */
export async function deleteAoi(aoiId) {
  try {
    await withAoiRetry(() =>
      aoiHttp.delete(`${OBSERVE_EARTH_BASE_URL}${aoiId}/`, { headers: aoiHeaders() }),
    );
    return "deleted";
  } catch (error) {
    if (Number(error?.response?.status) === 404) return "already_gone";
    throw error;
  }
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

  // Fast path: cached on the farm doc. Confirm it still exists on ObservEarth;
  // if the AOI was deleted there, clear the stale id and resolve a new one.
  if (farm.weatherAoiId) {
    const exists = await aoiExists(farm.weatherAoiId);
    if (exists !== false) {
      return { aoiId: farm.weatherAoiId, created: false };
    }
    console.warn(
      `[Advisory] AOI ${farm.weatherAoiId} for farm ${farm._id} no longer exists on ObservEarth; re-resolving`,
    );
    await FarmField.updateOne(
      { _id: farm._id, weatherAoiId: farm.weatherAoiId },
      { $set: { weatherAoiId: null } },
    );
    farm.weatherAoiId = null;
  }

  const aoiName = farm._id.toString();
  const weatherName = compactAoiName(aoiName);

  // If the AOI list cannot be read we cannot tell whether this farm already has
  // an AOI, so do NOT create one: that is how duplicate AOIs pile up on the
  // account. The caller retries on the next advisory run.
  let aois;
  try {
    aois = await fetchAllAOIs();
  } catch (listErr) {
    throw new Error(
      `ObservEarth AOI list failed for farm ${aoiName}; not creating an AOI blind (${formatAoiError(
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

  // Someone else resolved this farm's AOI first. Use their id. Our AOI is now
  // an orphan on ObservEarth; log it so it can be removed in the AOI cleanup.
  const winner = await FarmField.findById(farm._id).select("weatherAoiId");
  if (created && winner?.weatherAoiId && winner.weatherAoiId !== aoiId) {
    console.warn(
      `[Advisory] orphan AOI ${aoiId} for farm ${aoiName} (lost race to ${winner.weatherAoiId}); delete it in the AOI cleanup`,
    );
  }
  farm.weatherAoiId = winner?.weatherAoiId || aoiId;
  return { aoiId: farm.weatherAoiId, created: false };
}

export default resolveAOIForFarm;
