import SubscriptionPlan from "../../models/subscription-plan.model.js";
import {
  subscriptionPlanSchema,
  idSchema,
} from "../../validation/subscription/schema.js";
import { resolveSubscriptionPlanBrand } from "../../utils/auth/authUtils.js";
import { isOrgScopedAdmin } from "../../utils/auth/orgScope.js";

const VALID_BRANDS = ["cropgen", "biodrops", "aat"];

export const updateSubscriptionPlan = async (req, res) => {
  try {
    const { error: idErr } = idSchema.validate(req.params.id);
    if (idErr)
      return res.status(400).json({ success: false, message: "Invalid ID" });

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

    if (req.body.slug) {
      const duplicate = await SubscriptionPlan.findOne({
        slug: req.body.slug,
        _id: { $ne: req.params.id },
      });
      if (duplicate) {
        return res.status(400).json({
          success: false,
          message: `Slug "${req.body.slug}" is already taken`,
        });
      }
    }

    const current = await SubscriptionPlan.findById(req.params.id);
    if (!current)
      return res
        .status(404)
        .json({ success: false, message: "Plan not found" });

    // Org-scoped admins (AAT staff/client) may only edit their own brand's
    // plans. A global CropGen admin/developer has no organization of their
    // own, so they may edit any plan and — if editing this one — optionally
    // rebrand it explicitly instead of being forced to "cropgen".
    if (isOrgScopedAdmin(req.user)) {
      const ownBrand = resolveSubscriptionPlanBrand(req);
      if (current.brand !== ownBrand) {
        return res.status(403).json({
          success: false,
          message: "This plan belongs to another brand and cannot be edited here.",
        });
      }
      req.body.brand = ownBrand;
    } else {
      const requestedBrand = String(req.body.brand || "").toLowerCase();
      req.body.brand = VALID_BRANDS.includes(requestedBrand)
        ? requestedBrand
        : current.brand;
    }

    const updated = await SubscriptionPlan.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
      { new: true, runValidators: true },
    );

    res.json({ success: true, data: updated });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
};
