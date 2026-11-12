/**
 * Subscription display vs Razorpay charge:
 * - Razorpay plans always use INR (paise).
 * - resolveRazorpayChargeMinor: use an INR pricing row when present; otherwise USD row × RAZORPAY_USD_INR_RATE.
 * - resolveDisplayPricing: USD (or INR) row for receipts / UserSubscription display fields.
 */
import { displayMinorToInrMinor, USD_INR_RATE } from "../../services/razorpay.subscription.service.js";

/** 1 acre = 0.404686 ha (same factor as the web app). */
export const HECTARES_PER_ACRE = 0.404686;

/**
 * Price per acre (minor units) for a plan pricing row. Rows quoted per hectare
 * are converted, because field area (and therefore every charge) is in acres.
 * May be fractional; round only the final total.
 */
export function perAcreMinor(row) {
  const minor = Number(row?.pricePerUnitMinor) || 0;
  return row?.unit === "hectare" ? minor * HECTARES_PER_ACRE : minor;
}

/** Map API billingCycle to UserSubscription.billingPattern (Razorpay commitment). */
export function billingPatternFromBillingCycle(billingCycle) {
  if (billingCycle === "monthly") return "twelve_monthly";
  if (billingCycle === "season") return "season";
  return "yearly";
}

/** Inverse of billingPatternFromBillingCycle. */
export function billingCycleFromBillingPattern(pattern) {
  if (pattern === "twelve_monthly") return "monthly";
  if (pattern === "season") return "season";
  return "yearly";
}

/**
 * INR charged on Razorpay: prefer explicit INR plan row for the cycle;
 * else USD row converted with RAZORPAY_USD_INR_RATE.
 * @returns {{ chargedMinor: number, source: "INR"|"USD_FX" } | null}
 */
export function resolveRazorpayChargeMinor(plan, area, billingCycle) {
  const a = Number(area) || 1;
  const inrRow = plan.pricing?.find(
    (p) => p.currency === "INR" && p.billingCycle === billingCycle,
  );
  if (inrRow) {
    return {
      chargedMinor: Math.max(Math.round(a * perAcreMinor(inrRow)), 100),
      source: "INR",
    };
  }
  const usdRow = plan.pricing?.find(
    (p) => p.currency === "USD" && p.billingCycle === billingCycle,
  );
  if (!usdRow) return null;
  const displayMinor = Math.round(a * perAcreMinor(usdRow));
  return {
    chargedMinor: displayMinorToInrMinor(displayMinor, "USD"),
    source: "USD_FX",
  };
}

/**
 * Display line (e.g. USD for web UI) for a billing cycle.
 * @returns {{ pricePerUnitMinor: number, totalAmountMinor: number, displayCurrency: string, exchangeRate: number|null } | null}
 */
/** Term window after first successful recurring charge (matches verify-order logic). */
export function computeRecurringTermBounds(
  billingCycle,
  now = new Date(),
  subscriptionEndDate = null,
) {
  let termEnd;
  let periodEnd;
  if (billingCycle === "yearly") {
    termEnd = new Date(now);
    termEnd.setFullYear(termEnd.getFullYear() + 1);
    periodEnd = termEnd;
  } else if (billingCycle === "season") {
    termEnd = subscriptionEndDate
      ? new Date(subscriptionEndDate)
      : new Date(now.getTime() + 120 * 86400000);
    periodEnd = termEnd;
  } else {
    termEnd = new Date(now);
    termEnd.setMonth(termEnd.getMonth() + 12);
    periodEnd = new Date(now);
    periodEnd.setMonth(periodEnd.getMonth() + 1);
  }
  return { termEnd, periodEnd };
}

export function resolveDisplayPricing(plan, area, billingCycle, displayCurrency = "USD") {
  const a = Number(area) || 1;
  const row = plan.pricing?.find(
    (p) => p.currency === displayCurrency && p.billingCycle === billingCycle,
  );
  if (!row) return null;
  const unitMinor = perAcreMinor(row);
  const totalMinor = Math.round(a * unitMinor);
  return {
    // UserSubscription stores unit "acre", so always record the per-acre price.
    pricePerUnitMinor: Math.round(unitMinor * 100) / 100,
    totalAmountMinor: totalMinor,
    displayCurrency,
    exchangeRate: displayCurrency === "USD" ? USD_INR_RATE() : null,
  };
}
