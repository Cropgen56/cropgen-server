/**
 * Shared enum values for farm/crop-instance fields. Single source of truth so
 * the model schema and any future validation/UI mirrors stay in sync.
 *
 * NOTE: "Inorganic" is kept temporarily alongside the new list for backward
 * compatibility with the current live frontend (cropgen-web-application),
 * which still submits "Inorganic" as a hardcoded option. Once the frontend
 * is migrated to the new FARMING_TYPES list (multi-crop Phase 4), drop
 * "Inorganic" from FARMING_TYPES and re-run the enum-cleanup migration.
 *
 * Irrigation: CropGen shows legacy types plus the expanded global list.
 * Biodrops/admin UIs may still offer only the three legacy values.
 */
export const FARMING_TYPES = [
  "Conventional",
  "Organic",
  "Integrated",
  "Natural",
  "Regenerative",
  "Precision",
  "Other",
  "Not Specified",
  "Inorganic", // legacy value, see note above
];

export const LEGACY_IRRIGATION_TYPES = [
  "open-irrigation",
  "drip-irrigation",
  "sprinkler",
];

export const IRRIGATION_TYPES = [
  "open-irrigation",
  "drip-irrigation",
  "sprinkler",
  "rainfed",
  "drip",
  "flood_surface",
  "furrow",
  "center_pivot",
  "micro_irrigation",
  "other",
  "not_specified",
];

export const IRRIGATION_TYPE_LABELS = {
  "open-irrigation": "Open Irrigation",
  "drip-irrigation": "Drip Irrigation",
  sprinkler: "Sprinkler",
  rainfed: "Rainfed",
  drip: "Drip",
  flood_surface: "Flood / Surface",
  furrow: "Furrow",
  center_pivot: "Center Pivot",
  micro_irrigation: "Micro Irrigation",
  other: "Other",
  not_specified: "Not Specified",
};

/**
 * Canonical irrigation family for advisory, fertigation, and carbon.
 * drip | sprinkler | flood | rainfed | default
 */
export function resolveIrrigationFamily(irrigationType) {
  const raw = String(irrigationType || "")
    .toLowerCase()
    .trim();
  if (!raw) return "default";
  if (raw.includes("rainfed")) return "rainfed";
  if (raw.includes("drip") || raw.includes("micro")) return "drip";
  if (raw.includes("sprinkler") || raw.includes("pivot")) return "sprinkler";
  if (
    raw.includes("flood") ||
    raw.includes("furrow") ||
    raw.includes("open") ||
    raw.includes("surface")
  ) {
    return "flood";
  }
  return "default";
}

export function formatIrrigationTypeLabel(irrigationType) {
  const raw = String(irrigationType || "").trim();
  if (!raw) return "";
  if (IRRIGATION_TYPE_LABELS[raw]) return IRRIGATION_TYPE_LABELS[raw];
  return raw
    .split(/[-_]/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export const CROP_LIFECYCLE_TYPES = ["seasonal", "perennial"];

export const CROP_ROLES = ["main", "intercrop", "cover"];
