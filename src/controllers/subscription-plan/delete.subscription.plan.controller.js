import SubscriptionPlan from "../../models/subscription-plan.model.js";
import { idSchema } from "../../validation/subscription/schema.js";
import { resolveSubscriptionPlanBrand } from "../../utils/auth/authUtils.js";
import { logActivity } from "../../utils/storage/activityLog.service.js";

export const deleteSubscriptionPlan = async (req, res) => {
  try {
    const { error } = idSchema.validate(req.params.id);
    if (error)
      return res.status(400).json({ success: false, message: "Invalid ID" });

    const plan = await SubscriptionPlan.findById(req.params.id).lean();
    if (!plan)
      return res
        .status(404)
        .json({ success: false, message: "Plan not found" });

    const brand = resolveSubscriptionPlanBrand(req);
    if (plan.brand !== brand) {
      return res.status(403).json({
        success: false,
        message: "This plan belongs to another brand and cannot be deleted here.",
      });
    }

    await SubscriptionPlan.findByIdAndDelete(req.params.id);

try {
  await logActivity({
    userId: req.user?.id || req.user?._id || null,
    userName: req.user?.email || "Unknown",
    action: "DELETE",
    module: "Subscription",
    description: `Deleted subscription plan: ${plan.name || plan.slug}`,
    status: "SUCCESS",
  });
} catch (logError) {
  console.error(
    "Failed to record subscription plan deletion activity:",
    logError.message,
  );
}

res.json({ success: true, message: "Plan deleted successfully" });
  } catch (e) {
    res.status(500).json({ success: false, message: "Server error" });
  }
};
