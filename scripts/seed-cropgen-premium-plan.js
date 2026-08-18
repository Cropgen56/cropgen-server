import "dotenv/config";
import mongoose from "mongoose";
import SubscriptionPlan from "../src/models/subscription-plan.model.js";
import { subscriptionPlanSchema } from "../src/validation/subscription/schema.js";

const payload = {
  name: "CropGen Premium",
  slug: "cropgen-premium",
  description: "All CropGen features included.",
  brand: "cropgen",
  platform: "web",
  isInternal: false,
  isTrialEnabled: true,
  trialDays: 15,
  pricing: [
    {
      currency: "INR",
      billingCycle: "monthly",
      pricePerUnitMinor: 9900, // ₹99.00 per acre per month
      unit: "acre",
    },
  ],
  features: {
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
  },
  active: true,
};

async function run() {
  const { error, value } = subscriptionPlanSchema.validate(payload, {
    abortEarly: false,
  });
  if (error) {
    console.error("Validation failed:", error.details.map((e) => e.message));
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI);
  console.log("Connected to", mongoose.connection.name);

  const existing = await SubscriptionPlan.findOne({ slug: value.slug });
  if (existing) {
    console.log(`Plan with slug "${value.slug}" already exists:`, existing._id.toString());
    await mongoose.disconnect();
    process.exit(0);
  }

  const plan = await SubscriptionPlan.create(value);
  console.log("Created plan:", plan._id.toString());
  console.log(JSON.stringify(plan, null, 2));

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
