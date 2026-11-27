import cron from "node-cron";
import FarmField from "../../models/field.model.js";
import { listAois, deleteAoi } from "./weather.utils.js";

const HEX24 = /^[0-9a-f]{24}$/i;

/**
 * Pure selection: which AOIs on the account are safe to delete.
 * - in use: referenced by some farm's weatherAoiId → never deleted
 * - duplicate: named after a farm that exists, but that farm uses another AOI
 * - orphan: named after a farm id that no longer exists
 * - anything else (manual names such as "Test") is never touched
 */
export function selectAoisForCleanup({ aois, inUseIds, farmIds }) {
  const candidates = [];
  for (const a of aois) {
    const id = String(a.id);
    if (inUseIds.has(id)) continue;
    const name = String(a.name ?? "");
    const farmId = name.replace(/-wx$/, "");
    if (!HEX24.test(farmId)) continue;
    candidates.push({
      id,
      name,
      area: Number(a.area) || 0,
      reason: farmIds.has(farmId) ? "duplicate" : "orphan",
    });
  }
  return candidates;
}

export function usageRatio({ usageHa, planCapHa }) {
  return planCapHa > 0 ? usageHa / planCapHa : 0;
}

/**
 * Deletes unused duplicate/orphan AOIs when account usage is at or above
 * `threshold` of the plan cap. Dry-run by default: it only reports.
 */
export async function runAoiCleanup({
  dryRun = true,
  threshold = 0.8,
  planCapHa = 5000,
  usageHaOverride = null,
  maxDeletes = 50,
} = {}) {
  const aois = await listAois();
  const usageHa =
    usageHaOverride ?? aois.reduce((sum, a) => sum + (Number(a.area) || 0), 0);
  const ratio = usageRatio({ usageHa, planCapHa });
  if (ratio < threshold) {
    return { ran: false, reason: "below_threshold", usageHa, planCapHa, ratio };
  }

  const farmsWithAoi = await FarmField.find({ weatherAoiId: { $nin: [null, ""] } })
    .select("weatherAoiId")
    .lean();
  const inUseIds = new Set(farmsWithAoi.map((f) => String(f.weatherAoiId)));
  const farmIds = new Set(
    (await FarmField.find({}).select("_id").lean()).map((f) => String(f._id)),
  );

  const candidates = selectAoisForCleanup({ aois, inUseIds, farmIds }).slice(0, maxDeletes);
  const result = { ran: true, dryRun, usageHa, planCapHa, ratio, candidates: candidates.length, deleted: 0, skipped: 0, failed: 0 };

  for (const c of candidates) {
    // Re-check right before deleting: a farm may have picked this AOI up since the list was read.
    const nowInUse = await FarmField.exists({ weatherAoiId: c.id });
    if (nowInUse) {
      result.skipped++;
      continue;
    }
    if (dryRun) {
      console.log(`[AOI cleanup] dry-run would delete ${c.reason} ${c.id} (${c.name}, ${c.area.toFixed(2)} ha)`);
      continue;
    }
    try {
      await deleteAoi(c.id);
      result.deleted++;
    } catch (error) {
      result.failed++;
      console.warn(`[AOI cleanup] delete failed for ${c.id}: ${error?.response?.status || error?.message}`);
    }
  }
  return result;
}

/**
 * Starts the nightly cleanup. Off unless AOI_CLEANUP_ENABLED=true.
 * AOI_CLEANUP_DRY_RUN defaults to true (report only).
 * AOI_USAGE_HA overrides the usage figure, for when the dashboard number is
 * known and differs from the sum of AOI areas.
 */
export function startAoiCleanupJob() {
  if (String(process.env.AOI_CLEANUP_ENABLED || "").toLowerCase() !== "true") {
    console.log("[AOI cleanup] disabled (set AOI_CLEANUP_ENABLED=true)");
    return;
  }
  const options = {
    dryRun: String(process.env.AOI_CLEANUP_DRY_RUN ?? "true").toLowerCase() !== "false",
    threshold: Number(process.env.AOI_CLEANUP_THRESHOLD) || 0.8,
    planCapHa: Number(process.env.AOI_PLAN_CAP_HA) || 5000,
    usageHaOverride: process.env.AOI_USAGE_HA ? Number(process.env.AOI_USAGE_HA) : null,
    maxDeletes: Number(process.env.AOI_CLEANUP_MAX_DELETES) || 50,
  };
  const schedule = process.env.AOI_CLEANUP_CRON || "30 3 * * 0"; // Sundays 03:30
  cron.schedule(schedule, async () => {
    try {
      const result = await runAoiCleanup(options);
      console.log("[AOI cleanup]", JSON.stringify(result));
    } catch (error) {
      console.error("[AOI cleanup] run failed:", error?.message || error);
    }
  });
  console.log(`[AOI cleanup] scheduled "${schedule}" (dryRun=${options.dryRun}, threshold=${options.threshold})`);
}
