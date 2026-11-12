/**
 * Mobile app plan rules.
 *
 * The CropGen mobile app is India-only: it sells only the cropgen-brand
 * mobile plans, priced in INR. Web requests never buy mobile plans.
 *
 * The mobile app identifies itself with `X-Client-App: cropgen_ios|cropgen_android`.
 */

import { isNativeCropgenAppRequest } from "../auth/nativeAppAccess.js";

export const MOBILE_PLAN_BRAND = "cropgen";
export const MOBILE_PLAN_CURRENCY = "INR";

export function isMobileAppRequest(req) {
  return isNativeCropgenAppRequest(req);
}

/**
 * Returns an error message when this request may not use this plan, else null.
 */
export function mobilePlanRestrictionMessage(req, plan, currency) {
  if (isMobileAppRequest(req)) {
    const onMobile = plan.platform === "mobile" || plan.platform === "all";
    if (!onMobile || plan.brand !== MOBILE_PLAN_BRAND) {
      return "This plan is not available in the mobile app";
    }
    if (String(currency || "").toUpperCase() !== MOBILE_PLAN_CURRENCY) {
      return "The mobile app supports INR payments only";
    }
    return null;
  }

  if (plan.platform === "mobile") {
    return "This plan is available only in the mobile app";
  }
  return null;
}

/**
 * Keeps only INR price rows on a plan returned to the mobile app.
 * Shared ("all") plans are reported as "mobile" because released app builds
 * only list plans whose platform is exactly "mobile".
 */
export function restrictPlanToMobileInr(plan) {
  return {
    ...plan,
    platform: plan.platform === "all" ? "mobile" : plan.platform,
    pricing: (plan.pricing || []).filter(
      (pr) => String(pr.currency).toUpperCase() === MOBILE_PLAN_CURRENCY,
    ),
  };
}
