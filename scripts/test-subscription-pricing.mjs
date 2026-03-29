/**
 * Smoke tests for subscription pricing helpers (no Jest ESM config required).
 *   node scripts/test-subscription-pricing.mjs
 */
import assert from "assert";
import {
  billingPatternFromBillingCycle,
  billingCycleFromBillingPattern,
  resolveRazorpayChargeMinor,
  computeRecurringTermBounds,
} from "../src/utils/subscriptionPricing.js";

assert.strictEqual(billingPatternFromBillingCycle("monthly"), "twelve_monthly");
assert.strictEqual(billingCycleFromBillingPattern("twelve_monthly"), "monthly");

const plan = {
  pricing: [
    { currency: "INR", billingCycle: "monthly", pricePerUnitMinor: 50000 },
    { currency: "USD", billingCycle: "monthly", pricePerUnitMinor: 500 },
  ],
};
const r = resolveRazorpayChargeMinor(plan, 2, "monthly");
assert.strictEqual(r.source, "INR");
assert.strictEqual(r.chargedMinor, 100000);

const now = new Date("2025-01-15T12:00:00Z");
const { termEnd } = computeRecurringTermBounds("yearly", now);
assert.strictEqual(termEnd.getFullYear(), 2026);

console.log("subscriptionPricing smoke tests OK");
