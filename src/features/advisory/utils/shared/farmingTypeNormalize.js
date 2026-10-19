export function normalizeTypeOfFarming(value) {
  const k = String(value ?? "").trim().toLowerCase();
  if (k === "organic") return "Organic";
  if (k === "inorganic") return "Inorganic";
  if (k === "integrated") return "Integrated";
  return "Integrated";
}
