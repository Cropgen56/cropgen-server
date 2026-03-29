import SubscriptionPlan from "../../models/subscriptionplan.model.js";

export const getAllSubscriptionPlans = async (req, res) => {
  try {
    const { platform } = req.query;
    const filter = {};
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
