import UserSubscription from "../../models/user-subscription.model.js";

/**
 * CropGen web Free Trial, for both regions:
 *
 *   International (USD)  -> Growth plan   (slug "pro-plan")
 *   India (INR)          -> Basic plan    (slug "base-plan-mobile")
 *
 *   Duration            21 days
 *   Plan access         Growth plan features
 *   Maximum area        5 ha
 *   Farm mapping        1 farm only
 *   Additional farm     not allowed while the trial is running, unless the
 *                       account already has a paid farm (see freeTrialBlocksNewFarm)
 *   Additional area     not allowed while the trial is running
 *   Cost                free; autopay (Razorpay mandate) must be set up and the
 *                       Growth plan bills when the trial ends
 *
 * The web app offers both; the mobile app (India only) offers the INR Basic-plan
 * trial. A mobile request for the USD Growth plan is refused by the mobile plan
 * restriction, so no region check is needed here.
 */
export const FREE_TRIAL_DAYS = 21;
export const FREE_TRIAL_MAX_HECTARES = 5;
export const FREE_TRIAL_MAX_FARMS = 1;

/** Same factor the web app uses (acre -> hectare). */
export const ACRES_TO_HECTARES = 0.404686;
export const FREE_TRIAL_MAX_ACRES = FREE_TRIAL_MAX_HECTARES / ACRES_TO_HECTARES;

export const acresToHectares = (acres) =>
  (Number(acres) || 0) * ACRES_TO_HECTARES;

/** USD plan: the Growth plan (override the slug with FREE_TRIAL_PLAN_SLUG). */
export const freeTrialPlanSlug = () =>
  process.env.FREE_TRIAL_PLAN_SLUG || "pro-plan";

/** INR plan: the India Basic plan (override with FREE_TRIAL_PLAN_SLUG_INR). */
export const freeTrialPlanSlugInr = () =>
  process.env.FREE_TRIAL_PLAN_SLUG_INR || "base-plan-mobile";

/**
 * Currency the free trial is offered in for this plan ("USD" | "INR"), or
 * null when the plan carries no free-trial offer.
 */
export function freeTrialCurrencyForPlan(plan) {
  if (!plan || plan.brand !== "cropgen") return null;
  if (plan.platform === "web" && plan.slug === freeTrialPlanSlug()) return "USD";
  if (plan.platform === "all" && plan.slug === freeTrialPlanSlugInr()) return "INR";
  return null;
}

export const isFreeTrialPlan = (plan) => freeTrialCurrencyForPlan(plan) !== null;

/** Shape exposed on the plan catalogue so clients render the same limits. */
export const freeTrialOffer = (plan) => ({
  days: FREE_TRIAL_DAYS,
  maxHectares: FREE_TRIAL_MAX_HECTARES,
  maxFarms: FREE_TRIAL_MAX_FARMS,
  requiresAutopay: true,
  currency: freeTrialCurrencyForPlan(plan),
});

/**
 * True once the user has actually started a free trial. Rows abandoned before
 * the autopay mandate was saved stay in `trial_mandate_pending` and do not
 * count, so an abandoned checkout can be retried.
 */
export async function userHasUsedFreeTrial(userId) {
  return Boolean(
    await UserSubscription.exists({
      userId,
      freeTrialOffer: true,
      subscriptionPhase: { $ne: "trial_mandate_pending" },
    }),
  );
}

/**
 * True when the user has a paid subscription running: active, not expired, and
 * not a trial (monthly / yearly / season, including admin-activated plans).
 */
export async function userHasPaidSubscription(userId, now = new Date()) {
  return Boolean(
    await UserSubscription.exists({
      userId,
      status: "active",
      billingCycle: { $ne: "trial" },
      $or: [{ endDate: null }, { endDate: { $exists: false } }, { endDate: { $gte: now } }],
    }),
  );
}

/**
 * Whether adding a NEW farm is blocked by the free trial. The "1 farm only"
 * limit applies to trial-only accounts: someone with a paid farm who also tries
 * the trial on another farm may keep adding farms.
 */
export async function freeTrialBlocksNewFarm(userId, now = new Date()) {
  if (!(await getLiveFreeTrial(userId, now))) return false;
  return !(await userHasPaidSubscription(userId, now));
}

/** The user's free trial that is running right now (not converted, not expired). */
export async function getLiveFreeTrial(userId, now = new Date()) {
  const sub = await UserSubscription.findOne({
    userId,
    freeTrialOffer: true,
    billingCycle: "trial",
    status: "active",
  })
    .sort({ startDate: -1 })
    .lean();
  if (!sub) return null;
  if (sub.endDate && new Date(sub.endDate) < now) return null;
  return sub;
}
