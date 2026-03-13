import SubscriptionPlan from "../../models/subscriptionplan.model.js";
import { subscriptionPlanSchema } from "../../validation/subscriptionValidationSchema.js";

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

    const plan = await SubscriptionPlan.create(req.body);
    res.status(201).json({ success: true, data: plan });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
};
