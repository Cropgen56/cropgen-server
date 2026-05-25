import crypto from "crypto";
import SubscriptionBillingEvent from "../../models/subscription-billing-event.model.js";
import UserSubscription from "../../models/user-subscription.model.js";
import SubscriptionPlan from "../../models/subscription-plan.model.js";
import { createSubscriptionActivationNotification } from "../../services/notification.service.js";
import {
  billingCycleFromBillingPattern,
  resolveDisplayPricing,
  resolveRazorpayChargeMinor,
  computeRecurringTermBounds,
} from "../../utils/subscription/pricing.js";

async function processRazorpayEvent(event, eventId) {
  const eventType = event.event || "unknown";

  if (!eventId) {
    console.warn("Razorpay webhook: missing event id (header/body/fallback)");
    return;
  }

  const dup = await SubscriptionBillingEvent.findOne({ razorpayEventId: eventId });
  if (dup) return;

  const payload = event.payload || {};

  const subscriptionEntity = payload.subscription?.entity;
  const paymentEntity = payload.payment?.entity;
  const invoiceEntity = payload.invoice?.entity;

  const notes =
    subscriptionEntity?.notes ||
    invoiceEntity?.notes ||
    paymentEntity?.notes ||
    {};

  let userSubId = notes.userSubscriptionId;
  let userSubscription = null;

  if (userSubId && /^[a-f0-9]{24}$/i.test(String(userSubId))) {
    userSubscription = await UserSubscription.findById(userSubId);
  }

  if (!userSubscription && subscriptionEntity?.id) {
    userSubscription = await UserSubscription.findOne({
      razorpaySubscriptionId: subscriptionEntity.id,
    });
  }

  if (!userSubscription && invoiceEntity?.subscription_id) {
    userSubscription = await UserSubscription.findOne({
      razorpaySubscriptionId: invoiceEntity.subscription_id,
    });
  }

  const razorpaySubId =
    subscriptionEntity?.id ||
    invoiceEntity?.subscription_id ||
    paymentEntity?.subscription_id ||
    null;

  try {
    await SubscriptionBillingEvent.create({
      userSubscriptionId: userSubscription?._id,
      userId: userSubscription?.userId,
      fieldId: userSubscription?.fieldId,
      razorpayEventId: eventId,
      eventType,
      razorpayInvoiceId: invoiceEntity?.id || null,
      razorpayPaymentId: paymentEntity?.id || null,
      razorpaySubscriptionId: razorpaySubId,
      amountMinor:
        invoiceEntity?.amount != null ? Number(invoiceEntity.amount) : null,
      currency: invoiceEntity?.currency || null,
      payloadSummary: { contains: event.contains },
    });
  } catch (e) {
    if (e?.code === 11000) return;
    console.error("SubscriptionBillingEvent.create failed:", e);
    throw e;
  }

  if (eventType === "subscription.authenticated") {
    if (
      userSubscription?.billingCycle === "trial" &&
      userSubscription.billingMode === "recurring"
    ) {
      userSubscription.paymentMethodCapturedAt = new Date();
      userSubscription.subscriptionPhase = "trial_mandate_saved";
      /* Align with client verify: trial access only after mandate is authenticated. */
      if (userSubscription.status === "pending") {
        userSubscription.status = "active";
      }
      await userSubscription.save();
    }
    return;
  }

  if (
    eventType === "subscription.charged" ||
    eventType === "invoice.paid"
  ) {
    if (userSubscription) {
      await handleSuccessfulCharge(userSubscription, payload, subscriptionEntity);
    }
    return;
  }

  if (
    eventType === "payment.failed" ||
    eventType === "subscription.halted"
  ) {
    if (userSubscription) {
      console.warn("Razorpay payment issue", eventType, userSubscription._id);
    }
    return;
  }

  if (eventType === "subscription.cancelled") {
    if (userSubscription && userSubscription.billingMode === "recurring") {
      userSubscription.status = "expired";
      await userSubscription.save();
    }
    return;
  }

  if (eventType === "subscription.completed") {
    if (
      userSubscription &&
      userSubscription.billingMode === "recurring" &&
      userSubscription.billingPattern !== "season"
    ) {
      userSubscription.status = "expired";
      await userSubscription.save();
    }
  }
}

async function handleSuccessfulCharge(userSubscription, payload, subscriptionEntity) {
  const now = new Date();

  const isTrialConversion =
    userSubscription.billingCycle === "trial" &&
    userSubscription.postTrialPlanId &&
    userSubscription.billingMode === "recurring";

  if (isTrialConversion) {
    const targetPlan = await SubscriptionPlan.findById(
      userSubscription.postTrialPlanId || userSubscription.planId,
    );
    if (!targetPlan) return;

    const commitCycle = billingCycleFromBillingPattern(
      userSubscription.billingPattern || "yearly",
    );

    let display = resolveDisplayPricing(
      targetPlan,
      userSubscription.area,
      commitCycle,
      userSubscription.displayCurrency || "USD",
    );
    if (!display) {
      display = resolveDisplayPricing(
        targetPlan,
        userSubscription.area,
        commitCycle,
        "INR",
      );
    }
    if (!display) return;

    const charge = resolveRazorpayChargeMinor(
      targetPlan,
      userSubscription.area,
      commitCycle,
    );
    if (!charge) return;

    await UserSubscription.updateMany(
      {
        userId: userSubscription.userId,
        fieldId: userSubscription.fieldId,
        status: "active",
        _id: { $ne: userSubscription._id },
      },
      { status: "expired" },
    );

    const { termEnd, periodEnd } = computeRecurringTermBounds(
      commitCycle,
      now,
      userSubscription.endDate,
    );

    userSubscription.planId = targetPlan._id;
    userSubscription.billingCycle = commitCycle;
    userSubscription.displayCurrency = display.displayCurrency;
    userSubscription.pricePerUnitMinor = display.pricePerUnitMinor;
    userSubscription.totalAmountMinor = display.totalAmountMinor;
    userSubscription.chargedCurrency = "INR";
    userSubscription.exchangeRate = display.exchangeRate;
    userSubscription.status = "active";
    userSubscription.subscriptionPhase = "active_paid";
    userSubscription.billingPattern =
      commitCycle === "monthly"
        ? "twelve_monthly"
        : commitCycle === "season"
          ? "season"
          : "yearly";
    userSubscription.termStart = now;
    userSubscription.termEnd = termEnd;
    userSubscription.endDate = termEnd;
    userSubscription.currentPeriodStart = now;
    userSubscription.currentPeriodEnd = periodEnd;
    userSubscription.startDate = now;

    const inv = payload.invoice?.entity;
    if (inv?.payment_id) userSubscription.razorpayPaymentId = inv.payment_id;

    await userSubscription.save();
    await createSubscriptionActivationNotification(userSubscription._id);
    return;
  }

  if (userSubscription.billingMode !== "recurring") return;

  const sub = subscriptionEntity || payload.subscription?.entity;
  const periodEnd = sub?.current_end
    ? new Date(sub.current_end * 1000)
    : userSubscription.endDate;
  const periodStart = sub?.current_start
    ? new Date(sub.current_start * 1000)
    : now;

  userSubscription.currentPeriodStart = periodStart;
  userSubscription.currentPeriodEnd = periodEnd;
  userSubscription.status = "active";
  userSubscription.subscriptionPhase = "active_paid";

  if (userSubscription.billingPattern === "yearly" && periodEnd) {
    userSubscription.termEnd = periodEnd;
    userSubscription.endDate = periodEnd;
  }

  if (userSubscription.billingPattern === "twelve_monthly") {
    const paidCount = sub?.paid_count;
    if (paidCount >= 12) {
      userSubscription.status = "expired";
    } else if (periodEnd) {
      userSubscription.endDate = periodEnd;
    }
  }

  await userSubscription.save();
}

export const handleRazorpayWebhook = async (req, res) => {
  try {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!secret) {
      console.error("RAZORPAY_WEBHOOK_SECRET missing");
      return res.status(500).send("Server misconfigured");
    }

    const signature = req.headers["x-razorpay-signature"];
    const raw = req.body;
    if (!Buffer.isBuffer(raw)) {
      return res.status(400).send("Expected raw body");
    }

    const expected = crypto
      .createHmac("sha256", secret)
      .update(raw)
      .digest("hex");

    if (expected !== signature) {
      return res.status(400).send("Invalid signature");
    }

    const event = JSON.parse(raw.toString());

    const headerEventId =
      req.headers["x-razorpay-event-id"] ||
      req.headers["X-Razorpay-Event-Id"] ||
      "";

    const eventId =
      (headerEventId && String(headerEventId).trim()) ||
      (event?.id && String(event.id).trim()) ||
      (event?.created_at != null && event?.event
        ? `${event.event}_${event.created_at}`
        : null) ||
      crypto.createHash("sha256").update(raw).digest("hex");

    res.status(200).json({ received: true });

    await processRazorpayEvent(event, eventId);
  } catch (e) {
    console.error("Razorpay webhook error:", e);
    if (!res.headersSent) {
      return res.status(400).send("Bad request");
    }
  }
};
