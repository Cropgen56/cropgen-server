/**
 * Seed the Crop encyclopedia collection (src/models/crop.model.js) with the
 * 53 new crops added to the advisory system (data/cropgen_53_new_crops.json).
 *
 * Idempotent: skips any cropName that already exists in the collection.
 *
 * The schema requires `variety[].maturityDays` to be a Number, but the source
 * JSON gives it as a descriptive range string (e.g. "2555-3650 (7-10 years to
 * bearing)"). We parse the leading numeric range and store its average as
 * maturityDays, and append the original text to the variety description so
 * the nuance isn't lost.
 *
 * Usage (from cropgen-server root):
 *   node src/scripts/seed-new-crop-encyclopedia.mjs [--dry-run]
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
const DATA_PATH = path.join(__dirname, "../../data/cropgen_53_new_crops.json");
const DRY_RUN = process.argv.includes("--dry-run");

function parseMaturityDays(raw) {
  if (typeof raw === "number") return Math.round(raw);
  const nums = String(raw).match(/\d+(\.\d+)?/g);
  if (!nums || !nums.length) return null;
  if (nums.length >= 2) {
    return Math.round((parseFloat(nums[0]) + parseFloat(nums[1])) / 2);
  }
  return Math.round(parseFloat(nums[0]));
}

function transformCrop(raw) {
  const variety = (raw.variety || []).map((v) => {
    const parsedDays = parseMaturityDays(v.maturityDays);
    const originalText = String(v.maturityDays);
    const alreadyNumeric = typeof v.maturityDays === "number";
    return {
      ...v,
      maturityDays: parsedDays,
      description: alreadyNumeric
        ? v.description
        : `${v.description} (Maturity: ${originalText})`.trim(),
    };
  });
  return { ...raw, cropName: raw.cropName.toLowerCase(), variety };
}

async function main() {
  const data = JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));
  const transformed = data.map(transformCrop);

  if (DRY_RUN) {
    let invalid = 0;
    for (const crop of transformed) {
      const doc = new Crop(crop);
      const err = doc.validateSync();
      if (err) {
        invalid++;
        console.log(`--- ${crop.cropName} ---`);
        for (const k in err.errors) console.log("  -", k, ":", err.errors[k].message);
      }
    }
    console.log(`\n[dry-run] Checked ${transformed.length} crops, ${invalid} invalid.`);
    return;
  }

  await connectToDatabase();

  let created = 0;
  let skipped = 0;
  let failed = 0;

  for (const crop of transformed) {
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
