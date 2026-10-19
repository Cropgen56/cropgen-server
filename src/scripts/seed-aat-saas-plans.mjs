/**
 * Seed AAT SaaS plans (Starter / Growth / Professional / Enterprise).
 * Isolated via brand: "aat" — CropGen and Biodrops catalogs are untouched.
 *
 *   node src/scripts/seed-aat-saas-plans.mjs
 */
import dotenv from "dotenv";
import mongoose from "mongoose";
import SubscriptionPlan from "../models/subscription-plan.model.js";

dotenv.config();

const YEARLY_DISCOUNT = 0.8;

function usdMonthly(dollars) {
  return Math.round(dollars * 100);
}

function usdYearlyFromMonthly(dollars) {
  return Math.round(dollars * 12 * YEARLY_DISCOUNT * 100);
}

function pricingUsd(monthlyDollars) {
  return [
    {
      currency: "USD",
      billingCycle: "monthly",
      pricePerUnitMinor: usdMonthly(monthlyDollars),
      unit: "acre",
    },
    {
      currency: "USD",
      billingCycle: "yearly",
      pricePerUnitMinor: usdYearlyFromMonthly(monthlyDollars),
      unit: "acre",
    },
  ];
}

const STARTER_FEATURES = {
  satelliteImagery: true,
  cropHealthAndYield: true,
  soilAnalysisAndHealth: false,
  weatherAnalytics: true,
  vegetationIndices: true,
  waterIndices: false,
  evapotranspirationMonitoring: false,
  agronomicInsights: true,
  weeklyAdvisoryReports: false,
  cropGrowthMonitoring: false,
  farmOperationsManagement: false,
  diseaseDetectionAlerts: false,
  smartAdvisorySystem: false,
  soilReportGeneration: false,
};

const GROWTH_FEATURES = {
  ...STARTER_FEATURES,
  smartAdvisorySystem: true,
  diseaseDetectionAlerts: true,
  cropGrowthMonitoring: true,
};

const PROFESSIONAL_FEATURES = {
  ...GROWTH_FEATURES,
  soilAnalysisAndHealth: true,
  waterIndices: true,
  evapotranspirationMonitoring: true,
  weeklyAdvisoryReports: true,
  farmOperationsManagement: true,
  soilReportGeneration: true,
};

const ENTERPRISE_FEATURES = {
  ...PROFESSIONAL_FEATURES,
};

const TIERS = [
  {
    slugBase: "aat-starter",
    name: "Starter",
    description:
      "Up to 10 hectares. Satellite monitoring, crop health zones, 7-day weather, and basic NPK advisory.",
    maxHectares: 10,
    monthlyDollars: 19,
    isInternal: false,
    isTrialEnabled: true,
    trialDays: 7,
    features: STARTER_FEATURES,
  },
  {
    slugBase: "aat-growth",
    name: "Growth",
    description:
      "Up to 50 hectares. AI Advisory System, pest & disease alerts, BBCH growth stage, irrigation and yield.",
    maxHectares: 50,
    monthlyDollars: 59,
    isInternal: false,
    isTrialEnabled: true,
    trialDays: 7,
    features: GROWTH_FEATURES,
  },
  {
    slugBase: "aat-professional",
    name: "Professional",
    description:
      "Up to 200 hectares. SOC analytics, operations dashboard, weekly reports, carbon insights, priority support.",
    maxHectares: 200,
    monthlyDollars: 149,
    isInternal: false,
    isTrialEnabled: true,
    trialDays: 7,
    features: PROFESSIONAL_FEATURES,
  },
  {
    slugBase: "aat-enterprise",
    name: "Enterprise",
    description:
      "500+ hectares. Unlimited fields, custom AI advisory workflows, ERP/API, white-label, SLA. Custom pricing.",
    maxHectares: null,
    monthlyDollars: null,
    isInternal: true,
    isTrialEnabled: false,
    trialDays: 0,
    features: ENTERPRISE_FEATURES,
  },
];

async function upsertPlan(doc) {
  const existing = await SubscriptionPlan.findOne({ slug: doc.slug });
  if (existing) {
    await SubscriptionPlan.updateOne({ _id: existing._id }, { $set: doc });
    console.log(`updated ${doc.slug}`);
    return;
  }
  await SubscriptionPlan.create(doc);
  console.log(`created ${doc.slug}`);
}

async function main() {
  if (!process.env.MONGO_URI) throw new Error("MONGO_URI is not set");
  await mongoose.connect(process.env.MONGO_URI);

  for (const tier of TIERS) {
    for (const platform of ["web", "mobile"]) {
      await upsertPlan({
        name: tier.name,
        slug: `${tier.slugBase}-${platform}`,
        description: tier.description,
        brand: "aat",
        platform,
        maxHectares: tier.maxHectares,
        isInternal: tier.isInternal,
        isTrialEnabled: tier.isTrialEnabled,
        trialDays: tier.trialDays,
        pricing:
          tier.monthlyDollars == null ? [] : pricingUsd(tier.monthlyDollars),
        features: tier.features,
        active: true,
      });
    }
  }

  await mongoose.disconnect();
  console.log("AAT SaaS plans seeded (brand=aat). CropGen/Biodrops unchanged.");
}

main().catch(async (err) => {
  console.error(err);
  try {
    await mongoose.disconnect();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
