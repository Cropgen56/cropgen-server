import SubscriptionPlan from "../../models/subscription-plan.model.js";
import { idSchema } from "../../validation/subscription/schema.js";
import { resolveSubscriptionPlanBrand } from "../../utils/auth/authUtils.js";
import { isOrgScopedAdmin } from "../../utils/auth/orgScope.js";

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

    // Org-scoped admins (AAT staff/client) may only delete their own brand's
    // plans. A global CropGen admin/developer has no organization of their
    // own and may delete any brand's plan.
    if (isOrgScopedAdmin(req.user) && plan.brand !== resolveSubscriptionPlanBrand(req)) {
      return res.status(403).json({
        success: false,
        message: "This plan belongs to another brand and cannot be deleted here.",
      });
    }

    await SubscriptionPlan.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: "Plan deleted successfully" });
  } catch (e) {
    res.status(500).json({ success: false, message: "Server error" });
  }
};
