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
  const res = await axios.get(`${OBSERVE_EARTH_BASE_URL}?detail=false`, {
    headers: HEADERS,
  });

  return Array.isArray(res.data) ? res.data : res.data.results || [];
}

async function createAOI(name, geometry) {
  const res = await axios.post(
    OBSERVE_EARTH_BASE_URL,
    { name, geometry },
    { headers: HEADERS },
  );

  return res.data.id;
}

/* ===================== MAIN FUNCTION ===================== */

export async function resolveAOIForFarm(farm) {
  if (!farm || !farm._id) {
    throw new Error("Farm is required to resolve AOI");
  }

  const aoiName = farm._id.toString();

  // 1. Fetch AOIs
  const aois = await fetchAllAOIs();

  // 2. Check existing AOI
  const existing = aois.find((a) => a.name === aoiName);
  if (existing) {
    return {
      aoiId: existing.id,
      created: false,
    };
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
