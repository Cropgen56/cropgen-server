/**
 * Two public mobile plans only:
 * - Monthly: ₹119/acre/month + $2/acre/month, 15-day trial
 * - Yearly:  ₹599/acre/year + $8/acre/year, 15-day trial
 *
 * Deactivates legacy slugs: mobile-basic, mobile-pro, mobile-premium, mobile-main.
 *
 *   npm run seed:mobile-plans
 *   node scripts/seed-mobile-plans.mjs
 *
 * Requires MONGODB_URI or MONGO_URI in .env.
 */
import dotenv from "dotenv";
import mongoose from "mongoose";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });

const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
if (!uri) {
  console.error("Set MONGODB_URI or MONGO_URI in .env");
  process.exit(1);
}

await mongoose.connect(uri);
const { default: SubscriptionPlan } = await import(
  "../src/models/subscriptionplan.model.js",
);

/** USD minor = cents per acre; INR minor = paise per acre. */
const ALL_FEATURES = {
  satelliteImagery: true,
  cropHealthAndYield: true,
  soilAnalysisAndHealth: true,
  weatherAnalytics: true,
  vegetationIndices: true,
  waterIndices: true,
  evapotranspirationMonitoring: true,
  agronomicInsights: true,
  weeklyAdvisoryReports: true,
  cropGrowthMonitoring: true,
  farmOperationsManagement: true,
  diseaseDetectionAlerts: true,
  smartAdvisorySystem: true,
  soilReportGeneration: true,
};

const PLANS = [
  {
    name: "Monthly",
    slug: "mobile-monthly",
    description: "Billed every month per acre — 15-day free trial",
    trialDays: 15,
    pricing: [
      { currency: "INR", billingCycle: "monthly", pricePerUnitMinor: 11900 },
      { currency: "USD", billingCycle: "monthly", pricePerUnitMinor: 200 },
    ],
    features: { ...ALL_FEATURES },
  },
  {
    name: "Yearly",
    slug: "mobile-yearly",
    description: "Billed once per year per acre — 15-day free trial",
    trialDays: 15,
    pricing: [
      { currency: "INR", billingCycle: "yearly", pricePerUnitMinor: 59900 },
      { currency: "USD", billingCycle: "yearly", pricePerUnitMinor: 800 },
    ],
    features: { ...ALL_FEATURES },
  },
];

for (const p of PLANS) {
  const doc = {
    ...p,
    platform: "mobile",
    isInternal: false,
    isTrialEnabled: true,
    active: true,
  };
  const res = await SubscriptionPlan.findOneAndUpdate(
    { slug: p.slug },
    { $set: doc },
    { upsert: true, new: true },
  );
  console.log("Upserted:", res.slug, res.name);
}

const legacy = await SubscriptionPlan.updateMany(
  {
    slug: {
      $in: ["mobile-basic", "mobile-pro", "mobile-premium", "mobile-main"],
    },
  },
  { $set: { active: false } },
);
console.log("Deactivated legacy mobile slugs, modified:", legacy.modifiedCount);

await mongoose.disconnect();
console.log("Done.");
