/** Maximum active Super Admins allowed per BioDrops tenant. */
export const MAX_SUPER_ADMINS = 5;

/** BioDrops CRM admin hierarchy (highest rank first). */
export const ADMIN_LEVELS = [
  "super",
  "country",
  "state",
  "district",
  "ground",
];

export const ADMIN_LEVEL_RANK = {
  super: 5,
  country: 4,
  state: 3,
  district: 2,
  ground: 1,
};

export const ADMIN_ASSIGNMENT_STATUS = ["active", "suspended"];

export const ADMIN_PARENT_LEVEL = {
  country: "super",
  state: "country",
  district: "state",
  ground: "district",
};

/** CropGen platform roles that may manage BioDrops admin assignments. */
export const CROPGEN_PLATFORM_ROLES = new Set(["admin", "developer"]);
