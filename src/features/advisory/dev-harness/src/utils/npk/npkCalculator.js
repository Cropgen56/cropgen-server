export function normalizeCropName(n) { return String(n || "").toLowerCase().replace(/[^a-z0-9]/g, ""); }
export function calculateNPKFromfarmField() { return { available: { nitrogenKgPerHa: 20, phosphorousKgPerHa: 30, potassiumKgPerHa: 30 }, required: { nitrogenKgPerHa: 30, phosphorousKgPerHa: 60, potassiumKgPerHa: 40 }, recommendation: "" }; }
export function buildBarrenLandNpkFromField() { return calculateNPKFromfarmField(); }
