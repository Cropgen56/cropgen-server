import SubscriptionPlan from "../../models/subscription-plan.model.js";
import {
  subscriptionPlanSchema,
  idSchema,
} from "../../validation/subscription/schema.js";
import { resolveSubscriptionPlanBrand } from "../../utils/auth/authUtils.js";

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

    const brand = resolveSubscriptionPlanBrand(req);
    if (current.brand !== brand) {
      return res.status(403).json({
        success: false,
        message: "This plan belongs to another brand and cannot be edited here.",
      });
    }
    req.body.brand = brand;

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
