import axios from "axios";

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

function fieldToGeoJSON(field) {
  if (!Array.isArray(field) || field.length < 3) {
    throw new Error("Invalid farm polygon: minimum 3 points required");
  }

  const coords = field.map((p) => [p.lng, p.lat]);

  const first = coords[0];
  const last = coords[coords.length - 1];

  // Close polygon if needed
  if (first[0] !== last[0] || first[1] !== last[1]) {
    coords.push(first);
  }

  return {
    type: "Polygon",
    coordinates: [coords],
  };
}

/**
 * Fetch all AOIs from ObservEarth
 */

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
  const detail =
    error?.response?.data?.detail ||
    error?.response?.data?.message ||
    error?.message ||
    "Unknown AOI error";
  return status ? `status=${status} ${detail}` : String(detail);
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

  let aois = [];
  try {
    // 1. Fetch AOIs
    aois = await fetchAllAOIs();
  } catch (listErr) {
    // Observearth listing occasionally fails with 5xx infra errors.
    // Try direct create path to avoid blocking advisory end-to-end.
    console.warn(
      `[Advisory] AOI list failed for farm ${aoiName}; trying direct create (${formatAoiError(
        listErr,
      )})`,
    );
  }

  if (aois.length) {
    // 2. Check existing AOI
    const existing = aois.find((a) => a.name === aoiName);
    if (existing) {
      return {
        aoiId: existing.id,
        created: false,
      };
    }
  }

  // 3. Create AOI
  const geometry = fieldToGeoJSON(farm.field);

  const aoiId = await createAOI(aoiName, geometry);

  return {
    aoiId,
    created: true,
  };
}

/* ===================== EXPORT DEFAULT ===================== */

export default resolveAOIForFarm;
