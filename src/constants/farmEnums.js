/**
 * Shared enum values for farm/crop-instance fields. Single source of truth so
 * the model schema and any future validation/UI mirrors stay in sync.
 *
 * NOTE: "Inorganic" is kept temporarily alongside the new list for backward
 * compatibility with the current live frontend (cropgen-web-application),
 * which still submits "Inorganic" as a hardcoded option. Once the frontend
 * is migrated to the new FARMING_TYPES list (multi-crop Phase 4), drop
 * "Inorganic" from FARMING_TYPES and re-run the enum-cleanup migration.
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

export const IRRIGATION_TYPES = [
  "open-irrigation",
  "drip-irrigation",
  "sprinkler",
];

export const CROP_LIFECYCLE_TYPES = ["seasonal", "perennial"];

export const CROP_ROLES = ["main", "intercrop", "cover"];
