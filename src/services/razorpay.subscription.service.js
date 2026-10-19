import Razorpay from "razorpay";
import User from "../models/user.model.js";
import SubscriptionPlan from "../models/subscription-plan.model.js";
import {
  billingPatternFromBillingCycle,
  resolveRazorpayChargeMinor,
} from "../utils/subscription/pricing.js";

export const USD_INR_RATE = () =>
  Number(process.env.RAZORPAY_USD_INR_RATE || "91.46") || 91.46;

/**
 * Razorpay account per brand. BioDrops has its own Razorpay account
 * (RAZORPAY_BIODROPS_KEY_ID / _KEY_SECRET); every other brand — and BioDrops
 * when those vars are unset — uses the default RAZORPAY_KEY_ID / _KEY_SECRET.
 */
export function getRazorpayCredentials(brand) {
  if (
    brand === "biodrops" &&
    process.env.RAZORPAY_BIODROPS_KEY_ID &&
    process.env.RAZORPAY_BIODROPS_KEY_SECRET
  ) {
    return {
      keyId: process.env.RAZORPAY_BIODROPS_KEY_ID,
      keySecret: process.env.RAZORPAY_BIODROPS_KEY_SECRET,
    };
  }
  return {
    keyId: process.env.RAZORPAY_KEY_ID,
    keySecret: process.env.RAZORPAY_KEY_SECRET,
  };
}

export const getRazorpay = (brand) => {
  const { keyId, keySecret } = getRazorpayCredentials(brand);
  return new Razorpay({ key_id: keyId, key_secret: keySecret });
};

/**
 * Clients to try for an existing payment/subscription: the brand's own
 * account first, then the default account (records created before the brand
 * moved to its own Razorpay account still live there).
 */
export function razorpayClientsFor(brand) {
  const own = getRazorpayCredentials(brand);
  const fallback = getRazorpayCredentials();
  const clients = [getRazorpay(brand)];
  if (own.keyId !== fallback.keyId) clients.push(getRazorpay());
  return clients;
}

/** Secrets that may have signed a checkout payment for this brand (own account first). */
export function razorpaySignatureSecrets(brand) {
  return [
    ...new Set(
      [getRazorpayCredentials(brand).keySecret, getRazorpayCredentials().keySecret].filter(
        Boolean,
      ),
    ),
  ];
}

/** Name shown in the Razorpay dashboard (plans, customers) for a brand. */
export function razorpayBrandLabel(brand) {
  return brand === "biodrops" ? "BioDrops" : "CropGen";
}

/** Brand of a UserSubscription, from its plan ("cropgen" when unknown). */
export async function brandForSubscription(subscription) {
  if (!subscription?.planId) return "cropgen";
  const plan = await SubscriptionPlan.findById(
    subscription.planId?._id || subscription.planId,
  )
    .select("brand")
    .lean();
  return plan?.brand || "cropgen";
}

/**
 * Convert USD minor units (cents) to INR minor (paise) for charging.
 */
export function displayMinorToInrMinor(displayAmountMinor, displayCurrency) {
  if (displayCurrency === "USD") {
    const inr = Math.round((displayAmountMinor / 100) * USD_INR_RATE() * 100);
    return Math.max(inr, 100);
  }
  return Math.max(displayAmountMinor, 100);
}

/**
 * Razorpay's axios wrapper calls normalizeError(err) which does
 * `err.response.status` — when there is no HTTP response (network, DNS, timeout),
 * that throws TypeError and hides the real failure.
 */
export function coerceRazorpayError(err) {
  if (err && typeof err === "object" && err.statusCode != null) {
    return err;
  }
  if (
    err instanceof TypeError &&
    String(err.message || "").includes("status")
  ) {
    return {
      statusCode: 503,
      error: {
        description:
          "Could not reach Razorpay or the response was invalid (network, timeout, or TLS). Check connectivity, firewall, and that RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET match the same mode (test vs live).",
      },
    };
  }
  if (err?.response?.status != null) {
    return {
      statusCode: err.response.status,
      error: err.response.data?.error || {
        description: err.message || "Razorpay API error",
      },
    };
  }
  const netHint =
    err?.code === "ECONNREFUSED" || err?.code === "ENOTFOUND"
      ? ` (${err.code})`
      : "";
  return {
    statusCode: 503,
    error: {
      description:
        (err && err.message) ||
        `Razorpay request failed with no HTTP response${netHint}`,
    },
  };
}

function isStaleCustomerError(coerced) {
  const code = Number(coerced?.statusCode);
  const desc = String(coerced?.error?.description || "").toLowerCase();
  if (code === 404) return true;
  if (
    code === 400 &&
    (desc.includes("does not exist") ||
      desc.includes("invalid") ||
      desc.includes("no such customer"))
  ) {
    return true;
  }
  return false;
}

async function invokeRazorpay(fn) {
  try {
    return await fn();
  } catch (err) {
    throw coerceRazorpayError(err);
  }
}

/**
 * Ensures a Razorpay customer exists. Drops stale razorpayCustomerId if it
 * belongs to another Razorpay account/mode (live vs test).
 */
export async function ensureRazorpayCustomer(razorpay, userId, brand) {
  const user = await User.findById(userId).lean();
  if (!user) throw new Error("User not found");

  let customerId = user.razorpayCustomerId;

  if (customerId) {
    try {
      await invokeRazorpay(() => razorpay.customers.fetch(customerId));
      return { customerId };
    } catch (e) {
      if (isStaleCustomerError(e)) {
        await User.updateOne(
          { _id: userId },
          { $unset: { razorpayCustomerId: 1 } },
        );
        customerId = null;
      } else {
        throw e;
      }
    }
  }

  const name =
    [user.firstName, user.lastName].filter(Boolean).join(" ").trim() ||
    `${razorpayBrandLabel(brand)} user`;

  // Razorpay expects string "0": reuse existing customer by email/contact.
  // Number 0 is often ignored → default "1" → BAD_REQUEST "already exists".
  const customer = await invokeRazorpay(() =>
    razorpay.customers.create({
      name,
      email: user.email || undefined,
      contact: user.phone ? user.phone.replace(/\D/g, "").slice(-12) : undefined,
      fail_existing: "0",
      notes: { cropgenUserId: String(userId) },
    }),
  );

  await User.updateOne({ _id: userId }, { razorpayCustomerId: customer.id });

  return { customerId: customer.id };
}

export async function createRazorpayPlan(razorpay, params) {
  const { period, interval = 1, itemName, amountMinor, description } = params;

  return razorpay.plans.create({
    period,
    interval,
    item: {
      name: itemName.slice(0, 200),
      amount: amountMinor,
      currency: "INR",
      description: (description || "").slice(0, 200),
    },
  });
}

/**
 * Razorpay plan + subscription with first charge at trial end (post-trial recurring).
 */
export async function createPostTrialRazorpaySubscription({
  razorpay,
  userId,
  userSubscriptionId,
  plan,
  area,
  commitBillingCycle,
  trialEndDate,
}) {
  const charge = resolveRazorpayChargeMinor(plan, area, commitBillingCycle);
  if (!charge) {
    throw new Error("Could not resolve Razorpay charge for post-trial subscription");
  }

  const billingPattern = billingPatternFromBillingCycle(commitBillingCycle);
  let period = "monthly";
  let totalCount = MONTHLY_COMMIT_TOTAL_COUNT;
  if (commitBillingCycle === "yearly") {
    period = "yearly";
    totalCount = YEARLY_TOTAL_COUNT;
  } else if (commitBillingCycle === "season") {
    period = "monthly";
    totalCount = SEASON_SINGLE_TOTAL_COUNT;
  }

  const { customerId } = await ensureRazorpayCustomer(razorpay, userId, plan.brand);

  const rzPlan = await createRazorpayPlan(razorpay, {
    period,
    interval: 1,
    itemName: `${razorpayBrandLabel(plan.brand)} ${plan.slug} ${String(userSubscriptionId).slice(-8)}`,
    amountMinor: charge.chargedMinor,
    description: `${area} acres ${commitBillingCycle} post-trial`,
  });

  const startAtUnix = Math.floor(trialEndDate.getTime() / 1000);

  const rzSub = await createRazorpaySubscription(razorpay, {
    planId: rzPlan.id,
    customerId,
    startAtUnix,
    totalCount,
    notes: {
      userSubscriptionId: String(userSubscriptionId),
      cropgenUserId: String(userId),
      flow: "trial_to_paid",
      planSlug: plan.slug,
      commitBillingCycle,
    },
  });

  return { rzPlan, rzSub, billingPattern };
}

export async function createRazorpaySubscription(razorpay, params) {
  const {
    planId,
    customerId,
    startAtUnix,
    totalCount,
    notes,
    quantity = 1,
  } = params;

  const body = {
    plan_id: planId,
    customer_notify: 1,
    quantity,
    total_count: totalCount,
    notes: notes || {},
  };

  if (customerId) body.customer_id = customerId;
  if (startAtUnix != null) body.start_at = startAtUnix;

  return razorpay.subscriptions.create(body);
}

/** Cancel a Razorpay subscription if present; ignores common “already cancelled” errors. */
export async function cancelRazorpaySubscriptionBestEffort(razorpay, subscriptionId) {
  if (!subscriptionId) return;
  try {
    await invokeRazorpay(() => razorpay.subscriptions.cancel(subscriptionId));
  } catch (err) {
    const desc = String(
      err?.error?.description || err?.message || "",
    ).toLowerCase();
    if (
      desc.includes("already") ||
      desc.includes("cancelled") ||
      desc.includes("canceled") ||
      desc.includes("completed")
    ) {
      return;
    }
    console.warn("cancelRazorpaySubscriptionBestEffort:", err?.message || err);
  }
}

export function formatRazorpayApiError(err) {
  const desc =
    err?.error?.description ||
    err?.description ||
    (typeof err === "string" ? err : null);
  const code = Number(err?.statusCode);
  const status = code >= 400 && code < 600 ? code : 500;
  return {
    message: desc || err?.message || "Razorpay request failed",
    status,
  };
}

/**
 * Max Razorpay subscription cycles for yearly plans. UPI rejects checkout when
 * mandate expire_at is more than ~30 years out (Razorpay: "expire_at cannot be
 * more than 30 years for upi"). 40 yearly cycles exceeded that cap.
 */
export const YEARLY_TOTAL_COUNT = 30;
export const MONTHLY_COMMIT_TOTAL_COUNT = 12;
export const SEASON_SINGLE_TOTAL_COUNT = 1;
