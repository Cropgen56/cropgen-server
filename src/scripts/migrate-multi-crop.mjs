/**
 * Multi-crop-per-farm Phase 1 backfill.
 *
 * For every existing FarmField that doesn't already have a FieldCrop, create
 * one "primary" (main-role) FieldCrop mirroring its legacy flat cropName /
 * variety / sowingDate fields. Barren-land farms are skipped (no crop is
 * actually planted yet — they'll get their first FieldCrop naturally the
 * next time they're planted via updateField, see fieldCropSync.js).
 *
 * Also normalizes the legacy `typeOfFarming: "Inorganic"` data value to the
 * new `"Conventional"` label (the schema enum still accepts "Inorganic" too,
 * for any farms this doesn't reach and for the not-yet-updated frontend).
 *
 * Idempotent: skips any FarmField that already has a FieldCrop.
 *
 * Usage (from cropgen-server root):
 *   node src/scripts/migrate-multi-crop.mjs [--dry-run]
 */
import dotenv from "dotenv";
import mongoose from "mongoose";
import { connectToDatabase } from "../config/db.js";
import FarmField from "../models/field.model.js";
import FieldCrop from "../models/field-crop.model.js";
import { normalizeCropName } from "../utils/crop/growth/gddCalculator.js";
import { PERENNIAL_OR_MULTI_HARVEST_CROPS } from "../utils/crop/growth/cropMaturityGDD.js";

dotenv.config();

const DRY_RUN = process.argv.includes("--dry-run");

function parseLegacyDate(value) {
  const d = value ? new Date(value) : new Date();
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

async function main() {
  await connectToDatabase();

  /* ---------- 1. Normalize "Inorganic" -> "Conventional" ---------- */
  const inorganicCount = await FarmField.countDocuments({ typeOfFarming: "Inorganic" });
  console.log(`Farms with typeOfFarming "Inorganic": ${inorganicCount}`);
  if (inorganicCount && !DRY_RUN) {
    const result = await FarmField.updateMany(
      { typeOfFarming: "Inorganic" },
      { $set: { typeOfFarming: "Conventional" } },
    );
    console.log(`  -> renamed ${result.modifiedCount} to "Conventional"`);
  }

  /* ---------- 2. Backfill FieldCrop for farms that don't have one ---------- */
  const allFarms = await FarmField.find().lean();
  const existingCropFarmIds = new Set(
    (await FieldCrop.find().distinct("farmField")).map(String),
  );

  let created = 0;
  let skippedBarren = 0;
  let skippedExisting = 0;

  for (const farm of allFarms) {
    if (existingCropFarmIds.has(String(farm._id))) {
      skippedExisting += 1;
      continue;
    }
    if (farm.isBarrenLand) {
      skippedBarren += 1;
      continue;
    }
    if (!farm.cropName) {
      continue; // nothing to migrate
    }

    const lifecycle = PERENNIAL_OR_MULTI_HARVEST_CROPS.has(normalizeCropName(farm.cropName))
      ? "perennial"
      : "seasonal";

    const doc = {
      farmField: farm._id,
      user: farm.user,
      cropName: farm.cropName,
      variety: farm.variety || "",
      cropRole: "main",
      cropLifecycleType: lifecycle,
      startDate: parseLegacyDate(farm.sowingDate),
      isActive: true,
    };

    if (DRY_RUN) {
      console.log("  [dry-run] would create FieldCrop:", doc);
    } else {
      await FieldCrop.create(doc);
    }
    created += 1;
  }

  console.log(
    `Done. created=${created} skippedExisting=${skippedExisting} skippedBarren=${skippedBarren} totalFarms=${allFarms.length}${DRY_RUN ? " (dry run, nothing written)" : ""}`,
  );

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
