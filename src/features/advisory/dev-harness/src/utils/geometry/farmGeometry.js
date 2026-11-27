export function resolveAdvisoryApiGeometry(f) { const pts = f.field || []; return { geometry: pts.length ? { type: "Polygon", coordinates: [[...pts.map((p) => [p.lng, p.lat]), [pts[0].lng, pts[0].lat]]] } : null, fullGeometry: null, sampled: false, farmAreaHa: null, sampleHa: null }; }
export function describeAdvisoryGeometry() { return "polygon"; }
