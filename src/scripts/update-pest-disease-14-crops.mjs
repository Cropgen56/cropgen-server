/**
 * Update pestProtection and diseaseProtection for the 14 crops covered by
 * data/cropgen_all_143_master.json (Wheat, Rice, Corn, Barley, Pearl Millet,
 * Sorghum, Finger Millet, Oats, Rye, Triticale, Teff, Buckwheat,
 * Amaranth (Grain), Quinoa).
 *
 * Each matched crop (by cropName, case-insensitive) has its existing
 * pestProtection/diseaseProtection arrays REPLACED wholesale by the richer
 * 8-entry arrays from the source file. Crops not already present in the
 * collection are skipped (this script only updates, never creates).
 *
 * The source entries have no `image` field, which is why crop.model.js's
 * pestProtection[].image / diseaseProtection[].image were relaxed from
 * required to optional (default: []) before running this.
 *
 * Usage (from cropgen-server root):
 *   node src/scripts/update-pest-disease-14-crops.mjs --dry-run
 *   node src/scripts/update-pest-disease-14-crops.mjs
 */
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";
import { connectToDatabase } from "../config/db.js";
import Crop from "../models/crop.model.js";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_PATH = path.join(__dirname, "../../cropgen_all_143_master.json");
const DRY_RUN = process.argv.includes("--dry-run");

async function main() {
  const data = JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));

  await connectToDatabase();

  let updated = 0;
  let skippedMissing = 0;
  let failed = 0;

  for (const crop of data) {
    const cropName = crop.cropName.toLowerCase();
    const existing = await Crop.findOne({ cropName });

    if (!existing) {
      skippedMissing++;
      console.log(`SKIP (not in DB): ${cropName}`);
      continue;
    }

    const before = {
      pest: existing.pestProtection.length,
      disease: existing.diseaseProtection.length,
    };

    existing.pestProtection = crop.pestProtection;
    existing.diseaseProtection = crop.diseaseProtection;

    const validationError = existing.validateSync([
      "pestProtection",
      "diseaseProtection",
    ]);
    if (validationError) {
      failed++;
      console.error(`FAILED (validation): ${cropName}`);
      for (const k in validationError.errors) {
        console.error("  -", k, ":", validationError.errors[k].message);
      }
      continue;
    }

    if (DRY_RUN) {
      updated++;
      console.log(
        `[dry-run] would update: ${cropName} | pest ${before.pest} -> ${crop.pestProtection.length} | disease ${before.disease} -> ${crop.diseaseProtection.length}`
      );
      continue;
    }

    try {
      await existing.save();
      updated++;
      console.log(
        `updated: ${cropName} | pest ${before.pest} -> ${crop.pestProtection.length} | disease ${before.disease} -> ${crop.diseaseProtection.length}`
      );
    } catch (err) {
      failed++;
      console.error(`FAILED (save): ${cropName} -`, err.message);
    }
  }

  console.log(
    `\n${DRY_RUN ? "[dry-run] " : ""}Done. updated=${updated} skippedMissing=${skippedMissing} failed=${failed}`
  );
  await mongoose.connection.close();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Script crashed:", err);
  process.exit(1);
});
