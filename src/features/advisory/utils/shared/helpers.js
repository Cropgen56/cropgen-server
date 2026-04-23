import convex from "@turf/convex";

export function formatDateISO(date) {
  return new Date(date).toISOString().slice(0, 10);
}

function deduplicateConsecutiveCoords(coords) {
  if (coords.length <= 1) return coords;
  const result = [coords[0]];
  for (let i = 1; i < coords.length; i++) {
    const prev = result[result.length - 1];
    const curr = coords[i];
    if (prev[0] !== curr[0] || prev[1] !== curr[1]) {
      result.push(curr);
    }
  }
  return result;
}

export function buildGeometryFromFarmField(farmField) {
  const points = farmField.field || [];
  if (!points.length) {
    throw new Error("FarmField.field is empty, cannot build geometry");
  }

  let coords = points.map((p) => [p.lng, p.lat]);
  coords = deduplicateConsecutiveCoords(coords);

  const first = coords[0];
  const last = coords[coords.length - 1];

  if (first[0] !== last[0] || first[1] !== last[1]) {
    coords.push([...first]);
  }

  if (coords.length < 4) {
    throw new Error("FarmField.field has too few distinct points (need at least 3)");
  }

  let polygon = { type: "Polygon", coordinates: [coords] };

  try {
    const hull = convex(polygon);
    if (hull?.geometry) {
      polygon = hull.geometry;
    }
  } catch {
    // keep original if convex fails
  }

  return polygon;
}
