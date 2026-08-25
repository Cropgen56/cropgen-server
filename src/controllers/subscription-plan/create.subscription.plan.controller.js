import SubscriptionPlan from "../../models/subscription-plan.model.js";
import { subscriptionPlanSchema } from "../../validation/subscription/schema.js";
import { resolveSubscriptionPlanBrand } from "../../utils/auth/authUtils.js";
import { isOrgScopedAdmin } from "../../utils/auth/orgScope.js";

const VALID_BRANDS = ["cropgen", "biodrops", "aat"];

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

    // Org-scoped admins (AAT staff/client) can only ever create plans for their
    // own organization. A global CropGen admin/developer has no organization of
    // their own, so they may explicitly choose the brand (e.g. to build out the
    // AAT catalog on AAT's behalf) instead of always being forced to "cropgen".
    if (isOrgScopedAdmin(req.user)) {
      req.body.brand = resolveSubscriptionPlanBrand(req);
    } else {
      const requestedBrand = String(req.body.brand || "").toLowerCase();
      req.body.brand = VALID_BRANDS.includes(requestedBrand)
        ? requestedBrand
        : resolveSubscriptionPlanBrand(req);
    }

    const plan = await SubscriptionPlan.create(req.body);
    res.status(201).json({ success: true, data: plan });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
};
