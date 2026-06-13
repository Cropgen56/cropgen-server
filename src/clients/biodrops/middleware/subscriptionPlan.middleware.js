import SubscriptionPlan from "../../../models/subscription-plan.model.js";

/** CRM catalog is BioDrops-only — never create CropGen plans from SatAgro. */
export function forceBiodropsPlanBrand(req, res, next) {
  req.body = { ...(req.body || {}), brand: "biodrops" };
  next();
}

export async function ensureBiodropsPlanParam(req, res, next) {
  try {
    const plan = await SubscriptionPlan.findById(req.params.id)
      .select("brand")
      .lean();
    if (!plan) {
      return res
        .status(404)
        .json({ success: false, message: "Plan not found" });
    }
    if (plan.brand !== "biodrops") {
      return res.status(403).json({
        success: false,
        message:
          "This plan belongs to another brand and cannot be edited from SatAgro CRM.",
      });
    }
    next();
  } catch {
    return res.status(500).json({ success: false, message: "Server error" });
  }
}
