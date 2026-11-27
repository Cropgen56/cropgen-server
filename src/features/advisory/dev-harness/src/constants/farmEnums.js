export function resolveIrrigationFamily(t) {
  const k = String(t || "").toLowerCase();
  if (/rain/.test(k)) return "rainfed";
  if (/drip|micro/.test(k)) return "drip";
  if (/sprink|pivot/.test(k)) return "sprinkler";
  if (/flood|furrow|surface|open|basin|border/.test(k)) return "flood";
  return "drip";
}
export function formatIrrigationTypeLabel(t) { return String(t || ""); }
