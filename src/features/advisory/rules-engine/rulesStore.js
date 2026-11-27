import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_RULES_PATH = join(__dirname, "data", "advisoryRules.json");

/** Defaults used when a key is missing from the workbook Settings tab. */
export const DEFAULT_SETTINGS = {
  live_statuses: "Approved",
  default_country: "IN",
  spray_max_wind_kmh: 15,
  spray_rain_block_mm: 5,
  spray_heat_c: 35,
  spray_harvest_block_bbch: 87,
  spray_reapply_days: 10,
  spray_rotation_lookback: 2,
  spray_window_past_days: 3,
  spray_window_future_days: 4,
  irr_rain_skip_mm: 10,
  irr_critical_fraction: 0.6,
  irr_effective_rain_fraction: 0.8,
  irr_min_effective_rain_mm: 2,
  irr_use_model_soil_moisture: "false",
  drip_trigger_fraction: 0.25,
  drip_max_minutes_per_day: 240,
  sprinkler_max_mm: 40,
  flood_min_mm: 40,
  flood_max_mm: 75,
  irr_assumed_interval_drip_days: 1,
  irr_assumed_interval_sprinkler_days: 7,
  irr_assumed_interval_flood_days: 12,
  drain_rain_3d_mm: 50,
  heat_alert_c: 40,
  frost_alert_c: 4,
  wind_alert_kmh: 30,
  heavy_rain_24h_mm: 64.5,
  heavy_rain_3d_mm: 100,
  dry_spell_days: 10,
  ndvi_cloud_max_pct: 40,
  whatsapp_param_max_chars: 160,
  fert_repeat_block_days: 21,
  // Condition monitor
  mon_max_scene_age_days: 12,
  mon_veg_drop_medium: 0.08,
  mon_veg_drop_high: 0.15,
  mon_expected_tolerance: 0.12,
  mon_ndmi_drop: 0.05,
  mon_ndmi_low: 0.0,
  mon_ndre_drop: 0.05,
  mon_ndvi_stable: 0.03,
  mon_sar_water_vv_db: -18,
  mon_sar_drop_db: 3,
  mon_sar_flood_rain_mm: 30,
  mon_stage_delay_bbch: 20,
  mon_task_overdue_days: 3,
  mon_no_clear_scene_days: 15,
  mon_whatsapp_min_severity: "High",
  mon_whatsapp_daily_cap: 3,
  mon_quiet_start_hour: 21,
  mon_quiet_end_hour: 6,
  spray_harvest_block_perennials: "true",
};

export function normalizeKey(value) {
  return String(value || "").toLowerCase().replace(/[^a-z]/g, "");
}

function parseStatuses(value) {
  return String(value || "")
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Build lookup indexes over the exported rules JSON.
 * @param {object} raw parsed advisoryRules.json
 * @param {{ liveStatuses?: string[] }} [opts]
 */
export function indexRules(raw, opts = {}) {
  if (!raw || typeof raw !== "object" || !raw.crops || !raw.sprayRules) {
    throw new Error("advisory rules: invalid rules JSON (missing crops/sprayRules)");
  }
  const settings = { ...DEFAULT_SETTINGS, ...(raw.settings || {}) };
  const envStatuses = parseStatuses(process.env.ADVISORY_LIVE_STATUSES);
  const liveStatuses = new Set(
    opts.liveStatuses?.length
      ? opts.liveStatuses
      : envStatuses.length
        ? envStatuses
        : parseStatuses(settings.live_statuses),
  );
  if (!liveStatuses.size) liveStatuses.add("Approved");
  liveStatuses.delete("Rejected");

  const isLive = (row) => liveStatuses.has(row?.status);

  const rulesByCrop = new Map();
  for (const rule of raw.sprayRules) {
    if (!rule.active || !isLive(rule)) continue;
    if (!raw.targets[rule.targetId]) continue;
    const list = rulesByCrop.get(rule.cropKey) || [];
    list.push(rule);
    rulesByCrop.set(rule.cropKey, list);
  }

  const productsByTarget = new Map();
  for (const product of raw.products) {
    if (!isLive(product)) continue;
    const list = productsByTarget.get(product.targetId) || [];
    list.push(product);
    productsByTarget.set(product.targetId, list);
  }

  // Region-wise registrations: "IN|soybean" -> [{ productId, regions[], dose, phiDays, brands }]
  const registrations = new Map();
  for (const reg of raw.productRegistrations || []) {
    if (!isLive(reg)) continue;
    const k = `${reg.country}|${reg.cropKey}`;
    const list = registrations.get(k) || [];
    list.push(reg);
    registrations.set(k, list);
  }
  // Pest presence: "FAW|IN" -> [{ regions[], months[] }]
  const pestRegions = new Map();
  for (const row of raw.pestRegions || []) {
    if (!isLive(row)) continue;
    const k = `${row.targetId}|${row.country}`;
    const list = pestRegions.get(k) || [];
    list.push(row);
    pestRegions.set(k, list);
  }

  const cropAliases = new Map();
  for (const crop of Object.values(raw.crops)) {
    cropAliases.set(crop.key, crop.key);
    cropAliases.set(normalizeKey(crop.name), crop.key);
    // "Cowpea (lobia)" → also match "cowpea"; "Canola / rapeseed" → "canola"
    const base = normalizeKey(String(crop.name).split(/[(/]/)[0]);
    if (base && !cropAliases.has(base)) cropAliases.set(base, crop.key);
  }

  return {
    version: raw.version || "unknown",
    generatedAt: raw.generatedAt || null,
    settings,
    liveStatuses: [...liveStatuses],
    crops: raw.crops,
    targets: raw.targets,
    irrigationMethods: raw.irrigationMethods || [],
    soils: raw.soils || {},
    alerts: raw.alerts || {},
    // Only reviewed curves drive "weaker than expected" alerts (rows without a status = legacy JSON, kept).
    expectedCurves: Object.fromEntries(
      Object.entries(raw.expectedCurves || {})
        .map(([k, rows]) => [k, rows.filter((r) => r.status === undefined || isLive(r))])
        .filter(([, rows]) => rows.length),
    ),
    monitoring: Object.fromEntries(
      Object.entries(raw.monitoring || {}).filter(([, m]) => isLive(m) || m.status === undefined),
    ),
    findCrop(name) {
      const key = cropAliases.get(normalizeKey(name));
      return key ? raw.crops[key] : null;
    },
    sprayRulesFor(cropKey) {
      return rulesByCrop.get(cropKey) || [];
    },
    productsFor(targetId) {
      return productsByTarget.get(targetId) || [];
    },
    /** Live registrations for a crop in a country (empty = none recorded yet). */
    registrationsFor(country, cropKey) {
      return registrations.get(`${country}|${cropKey}`) || [];
    },
    /**
     * Is this pest/disease known to occur in the region this month?
     * No rows for the pest+country → assumed present (rules still apply).
     */
    pestPresent(targetId, country, region, month) {
      const rows = pestRegions.get(`${targetId}|${country}`);
      if (!rows?.length) return true;
      return rows.some(
        (r) =>
          (r.regions.includes("ALL") || (region && r.regions.includes(region))) &&
          (!r.months.length || r.months.includes(month)),
      );
    },
  };
}

let cached = null;

/** Load (and cache) the rules shipped in data/advisoryRules.json, or ADVISORY_RULES_PATH. */
export function loadRules({ path, reload = false } = {}) {
  if (cached && !reload && !path) return cached;
  const file = path || process.env.ADVISORY_RULES_PATH || DEFAULT_RULES_PATH;
  const raw = JSON.parse(readFileSync(file, "utf8"));
  const indexed = indexRules(raw);
  if (!path) cached = indexed;
  return indexed;
}
