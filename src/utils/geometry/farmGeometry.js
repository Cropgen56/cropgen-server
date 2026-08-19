import { area as turfArea } from "@turf/turf";

/** Weather + satellite sample sent to external APIs (1–2 ha). */
export const ADVISORY_SAMPLE_HECTARES = 1.5;
/** Use the full field when it is already within the sample cap. */
export const ADVISORY_FULL_GEOMETRY_MAX_HECTARES = 2;
const METERS_PER_DEG_LAT = 111_320;

function toLngLatPoints(field) {
  if (!Array.isArray(field) || field.length < 3) {
    throw new Error("Invalid farm polygon: minimum 3 points required");
  }
  return field.map((point) => [Number(point?.lng), Number(point?.lat)]);
}

export function fieldCentroid(field) {
  const pts = toLngLatPoints(field);
  let lng = 0;
  let lat = 0;
  for (const [x, y] of pts) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      throw new Error("Invalid farm polygon: non-numeric coordinates");
    }
    lng += x;
    lat += y;
  }
  return { lng: lng / pts.length, lat: lat / pts.length };
}

/**
 * Square GeoJSON Polygon of `hectares` around the field centroid.
 * Used for ObservEarth AOI and large-field satellite/NPK calls.
 */
export function buildCentroidSamplePolygon(
  field,
  hectares = ADVISORY_SAMPLE_HECTARES,
) {
  const { lng, lat } = fieldCentroid(field);
  const halfMeters = Math.sqrt(Number(hectares) * 10_000) / 2;
  const dLat = halfMeters / METERS_PER_DEG_LAT;
  const cosLat = Math.cos((lat * Math.PI) / 180);
  const dLng = halfMeters / (METERS_PER_DEG_LAT * (Math.abs(cosLat) || 0.2));

  return {
    type: "Polygon",
    coordinates: [
      [
        [lng - dLng, lat - dLat],
        [lng + dLng, lat - dLat],
        [lng + dLng, lat + dLat],
        [lng - dLng, lat + dLat],
        [lng - dLng, lat - dLat],
      ],
    ],
  };
}

function polygonAreaHectares(geometry) {
  try {
    const m2 = turfArea(geometry);
    return Number.isFinite(m2) ? m2 / 10_000 : null;
  } catch {
    return null;
  }
}

/**
 * Geometry for advisory satellite / NPK APIs.
 * Small fields keep their real boundary; large fields use a 1.5 ha centroid sample.
 */
export function resolveAdvisoryApiGeometry(farmField) {
  const field = farmField?.field;
  const fullGeometry = buildFullFieldPolygon(field);
  const farmAreaHa = polygonAreaHectares(fullGeometry);
  const smallEnough =
    farmAreaHa != null && farmAreaHa <= ADVISORY_FULL_GEOMETRY_MAX_HECTARES;

  if (smallEnough) {
    return {
      geometry: fullGeometry,
      fullGeometry,
      sampled: false,
      farmAreaHa,
      sampleHa: farmAreaHa,
    };
  }

  return {
    geometry: buildCentroidSamplePolygon(field, ADVISORY_SAMPLE_HECTARES),
    fullGeometry,
    sampled: true,
    farmAreaHa,
    sampleHa: ADVISORY_SAMPLE_HECTARES,
  };
}

export function describeAdvisoryGeometry(meta) {
  if (!meta) return "geometry unresolved";
  const farm =
    meta.farmAreaHa != null ? `${meta.farmAreaHa.toFixed(2)}ha farm` : "farm";
  if (meta.sampled) {
    return `${meta.sampleHa}ha centroid sample (${farm})`;
  }
  return `full field (${farm})`;
}

function buildFullFieldPolygon(field) {
  const coords = toLngLatPoints(field);
  const first = coords[0];
  const last = coords[coords.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) {
    coords.push([...first]);
  }
  return { type: "Polygon", coordinates: [coords] };
}
