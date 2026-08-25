import SubscriptionPlan from "../../models/subscription-plan.model.js";
import { resolveSubscriptionPlanBrandForTarget } from "../../utils/auth/authUtils.js";

export const getAllSubscriptionPlans = async (req, res) => {
  try {
    const { platform, forUserId } = req.query;
    const filter = {
      brand: await resolveSubscriptionPlanBrandForTarget(req, forUserId),
    };
    if (platform === "mobile" || platform === "web") {
      filter.platform = platform;
    }

    const plans = await SubscriptionPlan.find(filter)
      .sort({ createdAt: -1 })
      .lean();
    res.json({ success: true, data: plans });
  } catch (e) {
    res.status(500).json({ success: false, message: "Server error" });
  }
};
