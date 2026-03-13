import SubscriptionPlan from "../../models/subscriptionplan.model.js";
import { idSchema } from "../../validation/subscriptionValidationSchema.js";

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

    await SubscriptionPlan.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: "Plan deleted successfully" });
  } catch (e) {
    res.status(500).json({ success: false, message: "Server error" });
  }
};
