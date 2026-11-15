/**
 * Mobile app plan rules.
 *
 * The CropGen mobile app is India-only: it sells only the cropgen-brand
 * mobile plans, priced in INR. Web requests never buy mobile plans.
 *
 * The mobile app identifies itself with `X-Client-App: cropgen_ios|cropgen_android`.
 */

import { isNativeCropgenAppRequest } from "../auth/nativeAppAccess.js";
import User from "../../models/user.model.js";

export const MOBILE_PLAN_BRAND = "cropgen";
export const MOBILE_PLAN_CURRENCY = "INR";

export function isMobileAppRequest(req) {
  return isNativeCropgenAppRequest(req);
}

export const MOBILE_INTL_CURRENCY = "USD";

/**
 * Region of a mobile user: "IN" (INR plan) or "INTL" (USD plans).
 * Decided by the profile country; without one, by an Indian phone prefix.
 * Unknown / signed-out defaults to "IN" (the app's original behaviour).
 */
export async function resolveMobileRegion(userId) {
  if (!userId) return "IN";
  const u = await User.findById(userId).select("country phone").lean();
  if (!u) return "IN";
  if (u.country) return String(u.country).toUpperCase() === "IN" ? "IN" : "INTL";
  // Phones are stored as E.164 (+<country code><number>); bare local numbers
  // from before country selection existed are treated as Indian.
  const phone = String(u.phone || "").trim();
  if (!phone) return "IN";
  if (phone.startsWith("+")) return phone.startsWith("+91") ? "IN" : "INTL";
  const digits = phone.replace(/\D/g, "");
  return digits.length === 10 || digits.startsWith("91") ? "IN" : "INTL";
}

/**
 * Returns an error message when this request may not use this plan, else null.
 * `region` is the mobile user's region (see resolveMobileRegion).
 */
export function mobilePlanRestrictionMessage(req, plan, currency, region = "IN") {
  if (isMobileAppRequest(req) && region === "INTL") {
    if (plan.brand !== MOBILE_PLAN_BRAND) {
      return "This plan is not available in the mobile app";
    }
    if (!(plan.pricing || []).some((p) => String(p.currency).toUpperCase() === MOBILE_INTL_CURRENCY)) {
      return "This plan is not available for your region";
    }
    if (String(currency || "").toUpperCase() !== MOBILE_INTL_CURRENCY) {
      return "International accounts pay in USD";
    }
    return null;
  }

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

/** International (USD) plans for the mobile app: USD price rows only. */
export function restrictPlanToMobileUsd(plan) {
  return {
    ...plan,
    platform: "mobile",
    pricing: (plan.pricing || []).filter(
      (pr) => String(pr.currency).toUpperCase() === MOBILE_INTL_CURRENCY,
    ),
  };
}
