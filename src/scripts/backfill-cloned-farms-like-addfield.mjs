/**
 * Make bulk-copied farms match addField:
 *   1. isBarrenLand = false
 *   2. create primary FieldCrop (soybean/sorghum)
 *   3. trigger first advisory
 *
 * Usage (from cropgen-server root):
 *   node src/scripts/backfill-cloned-farms-like-addfield.mjs
 *   node src/scripts/backfill-cloned-farms-like-addfield.mjs --generate
 */
import dotenv from "dotenv";
import mongoose from "mongoose";
import FarmField from "../models/field.model.js";
import FieldCrop from "../models/field-crop.model.js";
import User from "../models/user.model.js";
import "../models/organization.model.js";
import { createPrimaryFieldCrop } from "../utils/crop/fieldCropSync.js";
import { triggerInitialAdvisoryForNewField } from "../features/advisory/services/triggerInitialAdvisory.service.js";

dotenv.config();

const GENERATE = process.argv.includes("--generate");
const CONCURRENCY = Math.max(1, Number(process.env.ADVISORY_WORKER_CONCURRENCY) || 2);

const USER_IDS = [
  "6a733ecfdb866dcf87ec91a8", // Jan Ludike
  "6a744ac2dd7b4e84887c60ce", // Henk Pienaar
  "6a744ac3dd7b4e84887c64cb", // Theunis Coetzee
  "6a744ac5dd7b4e84887c6ca2", // Marina du Plessis
  "6a744ac6dd7b4e84887c708d", // Wikus Agenbag
  "6a7ef4480798dd6884b19d65", // Andreaco Le Grange
];

async function processWithConcurrency(items, concurrency, handler) {
  const inFlight = new Set();
  for (const item of items) {
    const task = Promise.resolve()
      .then(() => handler(item))
      .finally(() => inFlight.delete(task));
    inFlight.add(task);
    if (inFlight.size >= concurrency) {
      await Promise.race(inFlight);
    }
  }
  await Promise.allSettled([...inFlight]);
}

async function backfillFarms() {
  const users = await User.find({ _id: { $in: USER_IDS } }).select(
    "firstName lastName email language",
  );
  const userMap = Object.fromEntries(users.map((u) => [String(u._id), u]));

  const farms = await FarmField.find({ user: { $in: USER_IDS } }).sort({
    user: 1,
    createdAt: 1,
  });

  console.log(`[backfill] users=${users.length} farms=${farms.length}`);

  let unbarrened = 0;
  let cropsCreated = 0;
  let cropsExisting = 0;

  for (const farm of farms) {
    const owner = userMap[String(farm.user)];
    if (farm.isBarrenLand) {
      farm.isBarrenLand = false;
      await farm.save();
      unbarrened += 1;
    }

    const existing = await FieldCrop.findOne({
      farmField: farm._id,
      cropRole: "main",
      isActive: true,
    });

    if (existing) {
      cropsExisting += 1;
    } else {
      const created = await createPrimaryFieldCrop(farm);
      if (created) cropsCreated += 1;
      else {
        console.warn(
          `[backfill] FieldCrop not created for ${farm.fieldName} (${farm._id}) owner=${owner?.email}`,
        );
      }
    }
  }

  console.log(
    `[backfill] done unbarrened=${unbarrened} cropsCreated=${cropsCreated} cropsExisting=${cropsExisting}`,
  );
  return { farms, userMap };
}

async function generateAdvisories(farms, userMap) {
  let ok = 0;
  let failed = 0;
  const failures = [];

  await processWithConcurrency(farms, CONCURRENCY, async (farm) => {
    const owner = userMap[String(farm.user)];
    const label = `${owner?.email || farm.user} / ${farm.fieldName}`;
    const started = Date.now();
    console.log(`[generate] start ${label} farm=${farm._id}`);
    try {
      const result = await triggerInitialAdvisoryForNewField(farm._id, {
        language: owner?.language || "en",
        userId: farm.user,
      });
      if (result?.ok) {
        ok += 1;
        console.log(
          `[generate] ok ${label} advisory=${result.advisoryId} in ${Date.now() - started}ms`,
        );
      } else {
        failed += 1;
        failures.push({ label, error: result?.error || "unknown" });
        console.error(`[generate] fail ${label}: ${result?.error || "unknown"}`);
      }
    } catch (err) {
      failed += 1;
      failures.push({ label, error: err?.message || String(err) });
      console.error(`[generate] fail ${label}:`, err?.message || err);
    }
  });

  console.log(`[generate] done ok=${ok} failed=${failed} total=${farms.length}`);
  if (failures.length) {
    console.log("[generate] failures:");
    for (const f of failures) console.log(`  - ${f.label}: ${f.error}`);
  }
}

async function main() {
  if (!process.env.MONGO_URI) {
    throw new Error("MONGO_URI is not set");
  }
  await mongoose.connect(process.env.MONGO_URI);

  const { farms, userMap } = await backfillFarms();

  if (GENERATE) {
    await generateAdvisories(farms, userMap);
  } else {
    console.log("[backfill] skip generate (pass --generate to trigger advisories)");
  }

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error("Script failed:", err);
  try {
    await mongoose.disconnect();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
