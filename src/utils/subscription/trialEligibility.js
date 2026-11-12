import UserSubscription from "../../models/user-subscription.model.js";

/**
 * Trial rules per FARM (the 21-day Free Trial additionally has its own
 * once-per-account rule, see freeTrial.js):
 *
 *   - a farm gets ONE trial, ever (7-day or 21-day);
 *   - changing the plan of a farm that already has one is never a new trial.
 */

/**
 * True once a trial really started on this farm. A trial row keeps
 * `postTrialPlanId` after it converts to a paid plan, so a farm that went
 * trial -> paid -> expired still counts. Checkouts abandoned before the
 * autopay mandate was saved ("trial_mandate_pending") do not.
 */
export async function farmHasUsedTrial(fieldId) {
  return Boolean(
    await UserSubscription.exists({
      fieldId,
      status: { $in: ["active", "expired", "cancelled"] },
      subscriptionPhase: { $ne: "trial_mandate_pending" },
      $or: [{ billingCycle: "trial" }, { postTrialPlanId: { $ne: null } }],
    }),
  );
}

/** True when the farm has a plan running right now (active and not expired). */
export async function farmHasLiveSubscription(fieldId, now = new Date()) {
  return Boolean(
    await UserSubscription.exists({
      fieldId,
      status: "active",
      $or: [{ endDate: null }, { endDate: { $exists: false } }, { endDate: { $gte: now } }],
    }),
  );
}
