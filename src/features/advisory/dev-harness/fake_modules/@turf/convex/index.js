export default function convex(fc) { return { type: "Feature", geometry: fc?.features?.[0]?.geometry || null }; }
