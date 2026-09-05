/**
 * Seed the Crop encyclopedia collection (src/models/crop.model.js) with the
 * 65 new crops added to the advisory system:
 *   - data/cropinfo_65_NEW_MASTER.json      (agronomy fields)
 *   - data/pest_disease_65_NEW_MASTER.json  (pestProtection/diseaseProtection)
 * The two files share the same cropName order 1:1 and are merged here before
 * insert — same overall shape/flow as seed-new-crop-encyclopedia.mjs (the
 * earlier 53-crop round), just split across two source files instead of one.
 *
 * Idempotent: skips any cropName that already exists in the collection.
 *
 * Usage (from cropgen-server root):
 *   node src/scripts/seed-crop-encyclopedia-65.mjs [--dry-run]
 */
import dotenv from "dotenv";
import fs from "fs";
import { fileURLToPath } from "url";
import path from "path";
import { connectToDatabase } from "../config/db.js";
import Crop from "../models/crop.model.js";
import mongoose from "mongoose";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const INFO_PATH = path.join(__dirname, "../../data/cropinfo_65_NEW_MASTER.json");
const PEST_PATH = path.join(__dirname, "../../data/pest_disease_65_NEW_MASTER.json");
const DRY_RUN = process.argv.includes("--dry-run");

function mergeCrops(info, pest) {
  const pestByName = new Map(pest.map((p) => [p.cropName, p]));
  return info.map((crop) => {
    const p = pestByName.get(crop.cropName);
    if (!p) {
      throw new Error(`No pest/disease entry found for crop: ${crop.cropName}`);
    }
    return {
      ...crop,
      cropName: crop.cropName.toLowerCase(),
      pestProtection: p.pestProtection,
      diseaseProtection: p.diseaseProtection,
    };
  });
}

async function main() {
  const info = JSON.parse(fs.readFileSync(INFO_PATH, "utf8"));
  const pest = JSON.parse(fs.readFileSync(PEST_PATH, "utf8"));
  const merged = mergeCrops(info, pest);

  if (DRY_RUN) {
    let invalid = 0;
    for (const crop of merged) {
      const doc = new Crop(crop);
      const err = doc.validateSync();
      if (err) {
        invalid++;
        console.log(`--- ${crop.cropName} ---`);
        for (const k in err.errors) console.log("  -", k, ":", err.errors[k].message);
      }
    }
    console.log(`\n[dry-run] Checked ${merged.length} crops, ${invalid} invalid.`);
    return;
  }

  await connectToDatabase();

  let created = 0;
  let skipped = 0;
  let failed = 0;

  for (const crop of merged) {
    try {
      const existing = await Crop.findOne({ cropName: crop.cropName }).lean();
      if (existing) {
        skipped++;
        console.log(`skip (exists): ${crop.cropName}`);
        continue;
      }
      await Crop.create(crop);
      created++;
      console.log(`created: ${crop.cropName}`);
    } catch (err) {
      failed++;
      console.error(`FAILED: ${crop.cropName} -`, err.message);
    }
  }

  console.log(`\nSeed complete. created=${created} skipped=${skipped} failed=${failed}`);
  await mongoose.connection.close();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Seed script crashed:", err);
  process.exit(1);
});
