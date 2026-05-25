import mongoose from "mongoose";

const { Schema } = mongoose;

const PricingSchema = new Schema(
  {
    currency: {
      type: String,
      enum: ["INR", "USD"],
      required: true,
      uppercase: true,
    },

    billingCycle: {
      type: String,
      enum: ["monthly", "yearly", "season"],
      required: true,
    },

    pricePerUnitMinor: {
      type: Number,
      required: true,
      min: 0,
    },

    unit: {
      type: String,
      enum: ["acre"],
      default: "acre",
    },
  },
  { _id: false },
);

const SubscriptionPlanSchema = new Schema(
  {
    name: { type: String, required: true },
    slug: { type: String, required: true, unique: true },
    description: { type: String },

    platform: {
      type: String,
      enum: ["mobile", "web"],
      required: true,
      index: true,
    },
    isInternal: {
      type: Boolean,
      default: false,
      index: true,
    },
    isTrialEnabled: { type: Boolean, default: true },
    trialDays: { type: Number, default: 15 },

    pricing: {
      type: [PricingSchema],
    },

    features: {
      satelliteImagery: { type: Boolean, default: false },
      cropHealthAndYield: { type: Boolean, default: false },
      soilAnalysisAndHealth: { type: Boolean, default: false },
      weatherAnalytics: { type: Boolean, default: false },
      vegetationIndices: { type: Boolean, default: false },
      waterIndices: { type: Boolean, default: false },
      evapotranspirationMonitoring: { type: Boolean, default: false },
      agronomicInsights: { type: Boolean, default: false },
      weeklyAdvisoryReports: { type: Boolean, default: false },
      cropGrowthMonitoring: { type: Boolean, default: false },
      farmOperationsManagement: { type: Boolean, default: false },
      diseaseDetectionAlerts: { type: Boolean, default: false },
      smartAdvisorySystem: { type: Boolean, default: false },
      soilReportGeneration: { type: Boolean, default: false },
    },

    active: { type: Boolean, default: true, index: true },
  },
  { timestamps: true },
);

// Indexes (slug unique index comes from field definition)
SubscriptionPlanSchema.index({ platform: 1, active: 1 });

// Prevent OverwriteModelError
const SubscriptionPlan =
  mongoose.models.SubscriptionPlan ||
  mongoose.model("SubscriptionPlan", SubscriptionPlanSchema);

export default SubscriptionPlan;
