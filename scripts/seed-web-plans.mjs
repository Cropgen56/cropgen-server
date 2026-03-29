/**
 * Seeds three public web tiers (Basic / Pro / Premium) with USD + INR pricing
 * and a 7-day trial. Upserts by slug into collection `subscriptionplans`.
 *
 *   node scripts/seed-web-plans.mjs
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
  "../src/models/subscriptionplan.model.js"
);

/** USD minor = cents per acre; INR minor = paise per acre. */
const PLANS = [
  {
    name: "Basic",
    slug: "web-basic",
    description: "Essential farm monitoring for web",
    trialDays: 7,
    pricing: [
      { currency: "USD", billingCycle: "monthly", pricePerUnitMinor: 500 },
      { currency: "USD", billingCycle: "yearly", pricePerUnitMinor: 4800 },
      { currency: "INR", billingCycle: "monthly", pricePerUnitMinor: 46000 },
      { currency: "INR", billingCycle: "yearly", pricePerUnitMinor: 441600 },
    ],
    features: {
      satelliteImagery: true,
      weatherAnalytics: true,
      cropGrowthMonitoring: true,
      soilAnalysisAndHealth: false,
      vegetationIndices: false,
      waterIndices: false,
      evapotranspirationMonitoring: false,
      agronomicInsights: false,
      weeklyAdvisoryReports: false,
      cropHealthAndYield: false,
      farmOperationsManagement: false,
      diseaseDetectionAlerts: false,
      smartAdvisorySystem: false,
      soilReportGeneration: false,
    },
  },
  {
    name: "Pro",
    slug: "web-pro",
    description: "Advanced analytics and indices for web",
    trialDays: 7,
    pricing: [
      { currency: "USD", billingCycle: "monthly", pricePerUnitMinor: 1000 },
      { currency: "USD", billingCycle: "yearly", pricePerUnitMinor: 9600 },
      { currency: "INR", billingCycle: "monthly", pricePerUnitMinor: 92000 },
      { currency: "INR", billingCycle: "yearly", pricePerUnitMinor: 883200 },
    ],
    features: {
      satelliteImagery: true,
      weatherAnalytics: true,
      cropGrowthMonitoring: true,
      soilAnalysisAndHealth: true,
      vegetationIndices: true,
      waterIndices: true,
      evapotranspirationMonitoring: true,
      agronomicInsights: true,
      weeklyAdvisoryReports: true,
      cropHealthAndYield: true,
      farmOperationsManagement: false,
      diseaseDetectionAlerts: false,
      smartAdvisorySystem: false,
      soilReportGeneration: false,
    },
  },
  {
    name: "Premium",
    slug: "web-premium",
    description: "Full CropGen capability for web",
    trialDays: 7,
    pricing: [
      { currency: "USD", billingCycle: "monthly", pricePerUnitMinor: 1900 },
      { currency: "USD", billingCycle: "yearly", pricePerUnitMinor: 18240 },
      { currency: "INR", billingCycle: "monthly", pricePerUnitMinor: 174800 },
      { currency: "INR", billingCycle: "yearly", pricePerUnitMinor: 1678080 },
    ],
    features: {
      satelliteImagery: true,
      weatherAnalytics: true,
      cropGrowthMonitoring: true,
      soilAnalysisAndHealth: true,
      vegetationIndices: true,
      waterIndices: true,
      evapotranspirationMonitoring: true,
      agronomicInsights: true,
      weeklyAdvisoryReports: true,
      cropHealthAndYield: true,
      farmOperationsManagement: true,
      diseaseDetectionAlerts: true,
      smartAdvisorySystem: true,
      soilReportGeneration: true,
    },
  },
];

for (const p of PLANS) {
  const doc = {
    ...p,
    platform: "web",
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

await mongoose.disconnect();
console.log("Done.");
