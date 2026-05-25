import Joi from "joi";

const pricingSchema = Joi.object({
  currency: Joi.string().valid("INR", "USD").required(),
  billingCycle: Joi.string().valid("monthly", "yearly", "season").required(),
  pricePerUnitMinor: Joi.number().integer().min(0).required(),
  unit: Joi.string().valid("acre").default("acre"),
});

const pricingArraySchema = Joi.array().items(pricingSchema);

export const subscriptionPlanSchema = Joi.object({
  name: Joi.string().min(1).max(100).required(),
  slug: Joi.string().min(1).max(100).required(),
  description: Joi.string().max(500).allow("").optional(),

  platform: Joi.string().valid("mobile", "web").required(),

  // ✅ Added isInternal
  isInternal: Joi.boolean().default(false),

  isTrialEnabled: Joi.boolean().default(true),

  trialDays: Joi.number()
    .integer()
    .min(0)
    .when("isTrialEnabled", {
      is: true,
      then: Joi.number().min(1).required(),
      otherwise: Joi.number().default(0),
    }),

  // For normal public plans, require at least one pricing row.
  // For internal plans (admin-only), pricing is optional.
  pricing: Joi.when("isInternal", {
    is: true,
    then: pricingArraySchema.min(0).default([]),
    otherwise: pricingArraySchema.min(1),
  }),

  features: Joi.object({
    satelliteImagery: Joi.boolean().default(false),
    cropHealthAndYield: Joi.boolean().default(false),
    soilAnalysisAndHealth: Joi.boolean().default(false),
    weatherAnalytics: Joi.boolean().default(false),
    vegetationIndices: Joi.boolean().default(false),
    waterIndices: Joi.boolean().default(false),
    evapotranspirationMonitoring: Joi.boolean().default(false),
    agronomicInsights: Joi.boolean().default(false),
    weeklyAdvisoryReports: Joi.boolean().default(false),
    cropGrowthMonitoring: Joi.boolean().default(false),
    farmOperationsManagement: Joi.boolean().default(false),
    diseaseDetectionAlerts: Joi.boolean().default(false),
    smartAdvisorySystem: Joi.boolean().default(false),
    soilReportGeneration: Joi.boolean().default(false),
  }).required(),

  active: Joi.boolean().default(true),
});

export const idSchema = Joi.string().hex().length(24).required();
