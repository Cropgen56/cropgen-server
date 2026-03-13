import SubscriptionPlan from "../../models/subscriptionplan.model.js";
import { idSchema } from "../../validation/subscriptionValidationSchema.js";

export const getSubscriptionPlanById = async (req, res) => {
  try {
    const { error } = idSchema.validate(req.params.id);
    if (error)
      return res.status(400).json({ success: false, message: "Invalid ID" });

    const plan = await SubscriptionPlan.findById(req.params.id).lean();
    if (!plan)
      return res
        .status(404)
        .json({ success: false, message: "Plan not found" });

    res.json({ success: true, data: plan });
  } catch (e) {
    res.status(500).json({ success: false, message: "Server error" });
  }
};
