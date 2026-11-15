import SubscriptionPlan from "../../models/subscription-plan.model.js";
import { resolveSubscriptionPlanBrandForTarget } from "../../utils/auth/authUtils.js";
import {
  freeTrialOffer,
  isFreeTrialPlan,
  userHasUsedFreeTrial,
} from "../../utils/subscription/freeTrial.js";
import {
  MOBILE_PLAN_BRAND,
  restrictPlanToMobileInr,
  restrictPlanToMobileUsd,
  resolveMobileRegion,
} from "../../utils/subscription/mobilePlanRestriction.js";

export const getAllSubscriptionPlans = async (req, res) => {
  try {
    const { platform, forUserId } = req.query;
    const callerIdEarly = req.user?.id || req.user?._id;
    // Mobile: India sees the INR plan, everyone else the international USD plans.
    const mobileRegion =
      platform === "mobile" ? await resolveMobileRegion(callerIdEarly) : "IN";
    const filter = {
      brand: await resolveSubscriptionPlanBrandForTarget(req, forUserId),
    };
    if (platform === "mobile" || platform === "web") {
      // "all" = platform-agnostic plan (BioDrops) — surface it for either request.
      filter.platform = { $in: [platform, "all"] };
    }

    if (platform === "mobile") {
      // Mobile app is India-only: cropgen plans, INR prices only.
      filter.brand = MOBILE_PLAN_BRAND;
      // International plans are the web (USD) plans.
      if (mobileRegion === "INTL") filter.platform = { $in: ["mobile", "web", "all"] };
    }

    const plans = await SubscriptionPlan.find(filter)
      .sort({ createdAt: -1 })
      .lean();
    // Growth (USD) and Basic (INR) carry the 21-day Free Trial offer. It is
    // attached before the mobile INR restriction rewrites the plan's platform.
    // `used` tells the app up front that this account already had its trial
    // (it is once per account), so it does not offer a button the server refuses.
    const callerId = req.user?.id || req.user?._id;
    const trialUsed = callerId ? await userHasUsedFreeTrial(callerId) : false;
    const withOffer = plans.map((p) =>
      isFreeTrialPlan(p)
        ? { ...p, freeTrialOffer: { ...freeTrialOffer(p), used: trialUsed } }
        : p,
    );
    const hasCur = (p, c) =>
      (p.pricing || []).some((r) => String(r.currency).toUpperCase() === c);
    let data = withOffer;
    if (platform === "mobile") {
      data =
        mobileRegion === "INTL"
          ? withOffer.filter((p) => hasCur(p, "USD")).map(restrictPlanToMobileUsd)
          : withOffer.map(restrictPlanToMobileInr);
    }
    // Tell the client which price list this account belongs to (India -> INR,
    // everyone else -> USD) so web and mobile never guess it from a token.
    // Signed-out callers get null.
    let currency = null;
    if (callerId) {
      const region =
        platform === "mobile" ? mobileRegion : await resolveMobileRegion(callerId);
      currency = region === "INTL" ? "USD" : "INR";
    }
    res.json({ success: true, data, currency });
  } catch (e) {
    res.status(500).json({ success: false, message: "Server error" });
  }
};
