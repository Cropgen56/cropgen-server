/**
 * Plan-switch refund policy.
 *
 * Switching plans never prorates. The one exception: if the customer switches
 * within 24 hours of paying for the plan they are leaving, that payment is
 * refunded in full. After 24 hours nothing is refunded: the old plan simply
 * ends when the new one starts and the new plan is charged in full.
 */
export const PLAN_SWITCH_REFUND_WINDOW_MS = 24 * 60 * 60 * 1000;

const PAID_CYCLES = ["monthly", "yearly", "season"];

/**
 * Whether switching away from `oldSub` right now earns a refund of its payment.
 * Only a real, captured customer payment qualifies: trials, admin / demo /
 * product-card / credit activations carry no payment and are never refunded.
 *
 * @returns {{ eligible: boolean, reason: string }}
 */
export function planSwitchRefundDecision(oldSub, now = new Date()) {
  if (!oldSub) return { eligible: false, reason: "no_subscription" };
  if (oldSub.status !== "active") return { eligible: false, reason: "not_active" };
  if (!PAID_CYCLES.includes(oldSub.billingCycle)) {
    return { eligible: false, reason: "not_a_paid_plan" };
  }
  if (oldSub.activatedByAdmin || (oldSub.activationSource && oldSub.activationSource !== "razorpay")) {
    return { eligible: false, reason: "not_a_customer_payment" };
  }
  if (!oldSub.razorpayPaymentId) return { eligible: false, reason: "no_payment_on_record" };

  const paidAt = oldSub.startDate ? new Date(oldSub.startDate).getTime() : NaN;
  if (!Number.isFinite(paidAt)) return { eligible: false, reason: "no_start_date" };
  const elapsed = now.getTime() - paidAt;
  if (elapsed < 0 || elapsed > PLAN_SWITCH_REFUND_WINDOW_MS) {
    return { eligible: false, reason: "outside_24h_window" };
  }
  return { eligible: true, reason: "within_24h_of_payment" };
}
