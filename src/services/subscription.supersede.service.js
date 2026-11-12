import UserSubscription from "../models/user-subscription.model.js";
import SubscriptionBillingEvent from "../models/subscription-billing-event.model.js";
import {
  razorpayClientsFor,
  cancelRazorpaySubscriptionBestEffort,
  brandForSubscription,
  formatRazorpayApiError,
} from "./razorpay.subscription.service.js";
import { refundRazorpayPayment } from "./razorpay.order.service.js";
import { planSwitchRefundDecision } from "../utils/subscription/refundPolicy.js";

/**
 * A farm has one live plan. When a new subscription activates for a farm (plan
 * change / upgrade), the farm's other active subscriptions are retired:
 *   - their Razorpay autopay is cancelled (best effort) so the old plan is not
 *     billed alongside the new one,
 *   - if `refundRecentPayment` is set and the customer switched within 24 hours
 *     of paying for the old plan, that payment is refunded (see refundPolicy.js),
 *   - and they are marked "expired".
 *
 * Never throws on Razorpay errors: the new plan must activate even if the old
 * mandate cannot be cancelled or the refund cannot be issued (both are logged
 * and recorded, so an admin can finish them by hand).
 *
 * @returns {{ retired: number, refunds: Array<{subscriptionId: string, paymentId: string, status: "refunded"|"failed", refundId?: string, amountMinor?: number, message?: string}> }}
 */
export async function supersedeActiveSubscriptionsDetailed(
  newSub,
  { refundRecentPayment = false, now = new Date() } = {},
) {
  const replaced = await UserSubscription.find({
    userId: newSub.userId,
    fieldId: newSub.fieldId,
    status: "active",
    _id: { $ne: newSub._id },
  }).lean();

  if (!replaced.length) return { retired: 0, refunds: [] };

  const refunds = [];

  for (const row of replaced) {
    const rzId = row.razorpaySubscriptionId;
    if (rzId && rzId !== newSub.razorpaySubscriptionId) {
      // The subscription lives in exactly one Razorpay account (BioDrops has
      // its own); cancelling in the wrong one is a no-op.
      for (const razorpay of razorpayClientsFor("biodrops")) {
        try {
          await cancelRazorpaySubscriptionBestEffort(razorpay, rzId);
        } catch (err) {
          console.error(
            `supersedeActiveSubscriptions: could not cancel ${rzId}:`,
            err?.message || err,
          );
        }
      }
    }

    if (refundRecentPayment) {
      const result = await refundIfSwitchedWithinWindow(row, newSub, now);
      if (result) refunds.push(result);
    }
  }

  await UserSubscription.updateMany(
    { _id: { $in: replaced.map((r) => r._id) } },
    { $set: { status: "expired" } },
  );
  return { retired: replaced.length, refunds };
}

/** Refunds the old plan's payment when the switch is inside the 24-hour window. */
async function refundIfSwitchedWithinWindow(oldSub, newSub, now) {
  const decision = planSwitchRefundDecision(oldSub, now);
  if (!decision.eligible) return null;

  const eventId = `plan_switch_refund:${oldSub._id}`;
  // At most one refund per replaced subscription.
  if (await SubscriptionBillingEvent.exists({ razorpayEventId: eventId })) return null;

  const base = {
    subscriptionId: String(oldSub._id),
    paymentId: oldSub.razorpayPaymentId,
  };
  const ledger = {
    userSubscriptionId: oldSub._id,
    userId: oldSub.userId,
    fieldId: oldSub.fieldId,
    razorpayPaymentId: oldSub.razorpayPaymentId,
    razorpaySubscriptionId: oldSub.razorpaySubscriptionId || null,
  };

  try {
    const refund = await refundRazorpayPayment({
      razorpayPaymentId: oldSub.razorpayPaymentId,
      brand: await brandForSubscription(oldSub),
      notes: {
        reason: "plan_switch_within_24h",
        replacedSubscriptionId: String(oldSub._id),
        newSubscriptionId: String(newSub._id),
      },
    });
    await SubscriptionBillingEvent.create({
      ...ledger,
      razorpayEventId: eventId,
      eventType: "refund.plan_switch",
      amountMinor: refund?.amount ?? null,
      currency: refund?.currency || oldSub.chargedCurrency || "INR",
      payloadSummary: {
        refundId: refund?.id || null,
        newSubscriptionId: String(newSub._id),
        switchedAfterMs: now.getTime() - new Date(oldSub.startDate).getTime(),
      },
    }).catch((e) => {
      if (e?.code !== 11000) throw e;
    });
    return {
      ...base,
      status: "refunded",
      refundId: refund?.id || null,
      amountMinor: refund?.amount ?? null,
    };
  } catch (err) {
    // Razorpay errors arrive as plain objects, so format them for a readable reason.
    const message = formatRazorpayApiError(err).message || "Refund failed";
    console.error(`plan-switch refund failed for ${oldSub._id}:`, message);
    // Recorded so an admin can refund by hand; the new plan still activates.
    await SubscriptionBillingEvent.create({
      ...ledger,
      razorpayEventId: `plan_switch_refund_failed:${oldSub._id}:${now.getTime()}`,
      eventType: "refund.plan_switch.failed",
      payloadSummary: { error: message, newSubscriptionId: String(newSub._id) },
    }).catch(() => {});
    return { ...base, status: "failed", message };
  }
}

/** Same as the detailed version, without refunds. Returns how many were retired. */
export async function supersedeActiveSubscriptions(newSub) {
  return (await supersedeActiveSubscriptionsDetailed(newSub)).retired;
}
