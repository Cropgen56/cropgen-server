import SubscriptionPlan from "../../models/subscription-plan.model.js";
import { subscriptionPlanSchema } from "../../validation/subscription/schema.js";
import { resolveSubscriptionPlanBrand } from "../../utils/auth/authUtils.js";
import { logActivity } from "../../utils/storage/activityLog.service.js";

export const createSubscriptionPlan = async (req, res) => {
  try {
    const { error } = subscriptionPlanSchema.validate(req.body, {
      abortEarly: false,
    });
    if (error) {
      return res.status(400).json({
        success: false,
        message: "Validation error",
        errors: error.details.map((e) => e.message),
      });
    }

    if (await SubscriptionPlan.exists({ slug: req.body.slug })) {
      return res.status(400).json({
        success: false,
        message: `Slug "${req.body.slug}" is already in use`,
      });
    }

    req.body.brand = resolveSubscriptionPlanBrand(req);

    const plan = await SubscriptionPlan.create(req.body);

try {
  await logActivity({
    userId: req.user?.id || req.user?._id || null,
    userName: req.user?.email || "Unknown",
    action: "CREATE",
    module: "Subscription",
    description: `Created subscription plan: ${plan.name || plan.slug}`,
    status: "SUCCESS",
  });
} catch (logError) {
  console.error(
    "Failed to record subscription creation activity:",
    logError.message
  );
}

res.status(201).json({ success: true, data: plan });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
};
