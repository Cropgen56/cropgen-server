/**
 * CropGen plan catalog (Nov 2026):
 *  - India (INR): one Basic plan shared by web + mobile.
 *      ₹199/acre monthly, ₹999/acre yearly. Mobile shows per acre; web converts to per hectare.
 *  - International (USD, web only), priced per hectare:
 *      Starter $0.99 / $9.90, Growth $1.49 / $14.90, Professional $1.99 / $19.90 (monthly / yearly).
 *  - Enterprise (> 500 ha) stays "Custom pricing" (hard-coded card on web).
 *
 * Only touches the cropgen-brand plans listed below; other brands and internal plans are left alone.
 *
 * Dry run:  node src/scripts/apply-cropgen-plan-catalog.mjs
 * Apply:    node src/scripts/apply-cropgen-plan-catalog.mjs --apply
 */
import "dotenv/config";
import mongoose from "mongoose";
import SubscriptionPlan from "../models/subscription-plan.model.js";

const APPLY = process.argv.includes("--apply");

const inrAcre = (cycle, rupees) => ({
  currency: "INR",
  billingCycle: cycle,
  pricePerUnitMinor: Math.round(rupees * 100),
  unit: "acre",
});
const usdHectare = (cycle, dollars) => ({
  currency: "USD",
  billingCycle: cycle,
  pricePerUnitMinor: Math.round(dollars * 100),
  unit: "hectare",
});

const CATALOG = [
  {
    slug: "base-plan-mobile",
    set: {
      platform: "all",
      pricing: [inrAcre("monthly", 199), inrAcre("yearly", 999)],
    },
  },
  {
    slug: "basic-plan",
    set: {
      name: "Starter Plan",
      description: "Basic crop monitoring",
      platform: "web",
      pricing: [usdHectare("monthly", 0.99), usdHectare("yearly", 9.9)],
    },
  },
  {
    slug: "pro-plan",
    set: {
      name: "Growth Plan",
      description: "Advanced monitoring & AI advisory",
      platform: "web",
      pricing: [usdHectare("monthly", 1.49), usdHectare("yearly", 14.9)],
    },
  },
  {
    slug: "premium",
    set: {
      name: "Professional Plan",
      description: "All CropGen features",
      platform: "web",
      pricing: [usdHectare("monthly", 1.99), usdHectare("yearly", 19.9)],
    },
  },
];

const fmt = (p) =>
  `${p.name} [${p.platform}] ` +
  (p.pricing || [])
    .map((r) => `${r.currency} ${r.billingCycle} ${r.pricePerUnitMinor / 100}/${r.unit}`)
    .join(", ");

await mongoose.connect(process.env.MONGO_URI);
console.log(`${APPLY ? "APPLYING" : "DRY RUN"} on ${mongoose.connection.name}\n`);

for (const { slug, set } of CATALOG) {
  const plan = await SubscriptionPlan.findOne({ brand: "cropgen", slug });
  if (!plan) {
    console.log(`! ${slug}: not found — skipped`);
    continue;
  }
  console.log(`${slug}\n  before: ${fmt(plan)}`);
  plan.set(set);
  console.log(`  after:  ${fmt(plan)}`);
  if (APPLY) await plan.save();
}

await mongoose.disconnect();
if (!APPLY) console.log("\nNothing written. Re-run with --apply.");
