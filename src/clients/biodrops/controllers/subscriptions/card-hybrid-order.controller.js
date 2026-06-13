import UserSubscription from "../../../../models/user-subscription.model.js";
import SubscriptionPlan from "../../../../models/subscription-plan.model.js";
import {
  getRazorpay,
  ensureRazorpayCustomer,
  createRazorpayPlan,
  createRazorpaySubscription,
  formatRazorpayApiError,
  YEARLY_TOTAL_COUNT,
  MONTHLY_COMMIT_TOTAL_COUNT,
} from "../../../../services/razorpay.subscription.service.js";
import {
  resolveRazorpayChargeMinor,
} from "../../../../utils/subscription/pricing.js";
import {
  ensureCardEntitlementForFarmer,
  finalizeHybridCardSubscription,
  resolveHybridCardCheckout,
} from "../../services/cardCheckout.service.js";
import { logCardEvent } from "../../services/cardEvent.service.js";

const razorpay = getRazorpay();

export async function createBiodropsCardHybridOrder(req, res) {
  try {
    const userId = req.user?.id || req.user?._id;
    const {
      farmId,
      planId,
      billingCycle,
      displayCurrency: bodyDisplayCurrency,
      cardCode,
    } = req.body;

    if (!cardCode) {
      return res.status(400).json({ message: "cardCode is required" });
    }

    if (!bodyDisplayCurrency) {
      return res.status(400).json({ message: "Currency is required" });
    }

    const plan = await SubscriptionPlan.findOne({
      _id: planId,
      active: true,
      brand: "biodrops",
    });

    if (!plan) {
      return res.status(404).json({ message: "Plan not found for this app" });
    }

    const { field, card, split } = await resolveHybridCardCheckout({
      userId,
      code: cardCode,
      fieldId: farmId,
    });

    if (split.remainderAcres <= 0) {
      return res.status(400).json({
        message:
          "This field is fully covered by your card. Redeem the card instead of paying.",
      });
    }

    const { entitlement, validUntil } = await ensureCardEntitlementForFarmer({
      userId,
      card,
      fieldId: field._id,
    });

    const displayCurrency = bodyDisplayCurrency;
    const pricing = plan.pricing.find(
      (pr) =>
        pr.currency === displayCurrency && pr.billingCycle === billingCycle,
    );

    if (!pricing) {
      return res.status(400).json({ message: "Pricing not found" });
    }

    const billableAcres = split.remainderAcres;
    const displayAmountMinor = Math.round(
      billableAcres * pricing.pricePerUnitMinor,
    );
    let exchangeRate = null;
    if (displayCurrency === "USD") {
      exchangeRate = Number(process.env.RAZORPAY_USD_INR_RATE || "91.46");
    }

    const chargeResolved = resolveRazorpayChargeMinor(
      plan,
      billableAcres,
      billingCycle,
    );
    if (!chargeResolved) {
      return res.status(400).json({
        message: "Could not resolve INR charge for this plan and billing cycle",
      });
    }

    const startDate = new Date();
    const endDate = new Date(validUntil);

    const subscription = await UserSubscription.create({
      userId,
      fieldId: farmId,
      planId,
      platform: plan.platform,
      area: split.fieldAcres,
      unit: "acre",
      billingCycle,
      displayCurrency,
      pricePerUnitMinor: pricing.pricePerUnitMinor,
      totalAmountMinor: displayAmountMinor,
      chargedCurrency: "INR",
      exchangeRate,
      status: "pending",
      startDate,
      endDate,
      activationSource: "hybrid",
      cardAcres: split.cardAcres,
      paidAcres: split.remainderAcres,
      pendingAdminAcres: 0,
      entitlementId: entitlement._id,
      sourceCardId: card._id,
      billingMode: "recurring",
      subscriptionPhase: "card_payment_pending",
    });

    const { customerId } = await ensureRazorpayCustomer(razorpay, userId);

    let period = "monthly";
    let totalCount = MONTHLY_COMMIT_TOTAL_COUNT;
    let billingPattern = "twelve_monthly";

    if (billingCycle === "yearly") {
      period = "yearly";
      totalCount = YEARLY_TOTAL_COUNT;
      billingPattern = "yearly";
    }

    const rzPlan = await createRazorpayPlan(razorpay, {
      period,
      interval: 1,
      itemName: `BioDrops card+pay ${String(subscription._id).slice(-8)}`,
      amountMinor: chargeResolved.chargedMinor,
      description: `${billableAcres} acres (card hybrid)`,
    });

    const rzSub = await createRazorpaySubscription(razorpay, {
      planId: rzPlan.id,
      customerId,
      startAtUnix: undefined,
      totalCount,
      notes: {
        userSubscriptionId: String(subscription._id),
        cropgenUserId: String(userId),
        flow: "card_hybrid",
        sourceCardId: String(card._id),
      },
    });

    subscription.razorpaySubscriptionId = rzSub.id;
    subscription.razorpayPlanId = rzPlan.id;
    subscription.billingPattern = billingPattern;
    await subscription.save();

    return res.status(201).json({
      success: true,
      type: "card_hybrid",
      subscriptionId: subscription._id,
      startDate,
      endDate,
      cardAcresApplied: split.cardAcres,
      remainderAcresToPay: split.remainderAcres,
      fieldAcres: split.fieldAcres,
      razorpay: {
        subscription_id: rzSub.id,
        key: process.env.RAZORPAY_KEY_ID,
      },
    });
  } catch (error) {
    const statusCode = error.status || 500;
    if (statusCode >= 500) console.error("createBiodropsCardHybridOrder:", error);
    if (statusCode >= 500) {
      const { message, status } = formatRazorpayApiError(error);
      return res.status(status).json({ message });
    }
    return res.status(statusCode).json({ message: error.message });
  }
}

export async function activateBiodropsCardHybridAfterPayment(subscription) {
  await finalizeHybridCardSubscription(subscription);

  if (subscription.sourceCardId) {
    await logCardEvent({
      cardId: subscription.sourceCardId,
      eventType: "subscription_activated",
      actorType: "farmer",
      actorId: subscription.userId,
      metadata: {
        fieldId: subscription.fieldId,
        subscriptionId: subscription._id,
        cardAcres: subscription.cardAcres,
        paidAcres: subscription.paidAcres,
      },
    });
  }

  return subscription;
}
