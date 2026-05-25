import crypto from "crypto";
import UserSubscription from "../../models/user-subscription.model.js";
import FarmField from "../../models/field.model.js";
import SubscriptionPlan from "../../models/subscription-plan.model.js";
import SubscriptionBillingEvent from "../../models/subscription-billing-event.model.js";
import { createSubscriptionActivationNotification } from "../../services/notification.service.js";
import { getRazorpay } from "../../services/razorpay.subscription.service.js";

const razorpay = getRazorpay();

async function recordVerifyBillingEvent(
  subscription,
  razorpayPaymentId,
  razorpaySubscriptionId,
  verifyType,
) {
  try {
    await SubscriptionBillingEvent.create({
      userSubscriptionId: subscription._id,
      userId: subscription.userId,
      fieldId: subscription.fieldId,
      razorpayEventId: `client_verify_${razorpayPaymentId}`,
      eventType: `client.verify.${verifyType}`,
      razorpayInvoiceId: null,
      razorpayPaymentId,
      razorpaySubscriptionId: razorpaySubscriptionId || null,
      amountMinor:
        subscription.totalAmountMinor != null
          ? Number(subscription.totalAmountMinor)
          : null,
      currency:
        subscription.chargedCurrency || subscription.displayCurrency || null,
      payloadSummary: { verifyType },
    });
  } catch (e) {
    if (e?.code !== 11000) {
      console.error("SubscriptionBillingEvent verify ledger:", e);
    }
  }
}

export const verifySubscriptionOrder = async (req, res) => {
  try {
    const {
      subscriptionId,
      razorpay_payment_id,
      razorpay_order_id,
      razorpay_subscription_id,
      razorpay_signature,
    } = req.body;

    if (!subscriptionId || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({
        success: false,
        message: "Missing Razorpay verification fields",
      });
    }

    if (!razorpay_subscription_id && !razorpay_order_id) {
      return res.status(400).json({
        success: false,
        message: "Missing order or subscription id from Razorpay",
      });
    }

    const subscription = await UserSubscription.findById(subscriptionId);

    if (!subscription) {
      return res.status(404).json({
        success: false,
        message: "Subscription not found",
      });
    }

    const isTrialMandatePending =
      subscription.billingCycle === "trial" &&
      subscription.billingMode === "recurring" &&
      subscription.subscriptionPhase === "trial_mandate_pending";

    const isPendingPaidRecurring =
      subscription.status === "pending" &&
      subscription.billingMode === "recurring" &&
      subscription.billingCycle !== "trial";

    const isPendingLegacyOrder =
      subscription.status === "pending" &&
      subscription.billingMode === "legacy_order";

    let generatedSignature;
    if (razorpay_subscription_id) {
      generatedSignature = crypto
        .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
        .update(`${razorpay_payment_id}|${razorpay_subscription_id}`)
        .digest("hex");
    } else {
      generatedSignature = crypto
        .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
        .update(`${razorpay_order_id}|${razorpay_payment_id}`)
        .digest("hex");
    }

    if (generatedSignature !== razorpay_signature) {
      return res.status(400).json({
        success: false,
        message: "Invalid payment signature",
      });
    }

    /* Webhook may activate trial before client verify — same payment must still verify. */
    const isTrialMandateAlreadyDone =
      subscription.status === "active" &&
      subscription.billingCycle === "trial" &&
      subscription.billingMode === "recurring" &&
      subscription.subscriptionPhase === "trial_mandate_saved";

    if (isTrialMandateAlreadyDone) {
      if (
        razorpay_subscription_id &&
        subscription.razorpaySubscriptionId &&
        razorpay_subscription_id !== subscription.razorpaySubscriptionId
      ) {
        return res.status(400).json({
          success: false,
          message: "Subscription id mismatch",
        });
      }
      if (!subscription.razorpayPaymentId) {
        subscription.razorpayPaymentId = razorpay_payment_id;
        subscription.razorpaySignature = razorpay_signature;
        await subscription.save();
      }
      const farm = await FarmField.findById(subscription.fieldId);
      const plan = await SubscriptionPlan.findById(subscription.planId);
      return res.status(200).json({
        success: true,
        data: {
          subscriptionId: subscription._id,
          fieldName: farm?.fieldName,
          planName: plan?.name,
          transactionId: razorpay_payment_id,
          verifyType: "trial_mandate",
        },
      });
    }

    if (subscription.status === "active") {
      return res.status(400).json({
        success: false,
        message: "Subscription already activated",
      });
    }

    if (subscription.status !== "pending") {
      return res.status(400).json({
        success: false,
        message: "Subscription cannot be verified in this state",
      });
    }

    /* ================= TRIAL: mandate captured (still on trial until charged) ================= */
    if (isTrialMandatePending) {
      if (
        razorpay_subscription_id &&
        subscription.razorpaySubscriptionId &&
        razorpay_subscription_id !== subscription.razorpaySubscriptionId
      ) {
        return res.status(400).json({
          success: false,
          message: "Subscription id mismatch",
        });
      }

      subscription.razorpayPaymentId = razorpay_payment_id;
      subscription.razorpaySignature = razorpay_signature;
      subscription.paymentMethodCapturedAt = new Date();
      subscription.subscriptionPhase = "trial_mandate_saved";
      subscription.status = "active";
      await subscription.save();

      await recordVerifyBillingEvent(
        subscription,
        razorpay_payment_id,
        razorpay_subscription_id,
        "trial_mandate",
      );

      const farm = await FarmField.findById(subscription.fieldId);
      const plan = await SubscriptionPlan.findById(subscription.planId);

      return res.status(200).json({
        success: true,
        data: {
          subscriptionId: subscription._id,
          fieldName: farm?.fieldName,
          planName: plan?.name,
          transactionId: razorpay_payment_id,
          verifyType: "trial_mandate",
        },
      });
    }

    /* ================= PAID RECURRING (first charge at checkout) ================= */
    if (isPendingPaidRecurring) {
      await UserSubscription.updateMany(
        {
          userId: subscription.userId,
          fieldId: subscription.fieldId,
          status: "active",
          _id: { $ne: subscription._id },
        },
        { status: "expired" },
      );

      const now = new Date();
      let termEnd;
      let periodEnd;

      if (subscription.billingCycle === "yearly") {
        termEnd = new Date(now);
        termEnd.setFullYear(termEnd.getFullYear() + 1);
        periodEnd = termEnd;
      } else if (subscription.billingCycle === "season") {
        termEnd = subscription.endDate
          ? new Date(subscription.endDate)
          : new Date(now.getTime() + 120 * 86400000);
        periodEnd = termEnd;
      } else {
        termEnd = new Date(now);
        termEnd.setMonth(termEnd.getMonth() + 12);
        periodEnd = new Date(now);
        periodEnd.setMonth(periodEnd.getMonth() + 1);
      }

      subscription.status = "active";
      subscription.razorpayPaymentId = razorpay_payment_id;
      subscription.razorpaySignature = razorpay_signature;
      subscription.startDate = now;
      subscription.termStart = now;
      subscription.termEnd = termEnd;
      subscription.endDate = termEnd;
      subscription.currentPeriodStart = now;
      subscription.currentPeriodEnd = periodEnd;
      subscription.subscriptionPhase = "active_paid";

      await subscription.save();
      await createSubscriptionActivationNotification(subscription._id);

      await recordVerifyBillingEvent(
        subscription,
        razorpay_payment_id,
        razorpay_subscription_id,
        "recurring_first_charge",
      );

      const farm = await FarmField.findById(subscription.fieldId);
      const plan = await SubscriptionPlan.findById(subscription.planId);

      return res.status(200).json({
        success: true,
        data: {
          subscriptionId: subscription._id,
          fieldName: farm?.fieldName,
          planName: plan?.name,
          transactionId: razorpay_payment_id,
          verifyType: "recurring_first_charge",
        },
      });
    }

    /* ================= LEGACY ONE-TIME ORDER ================= */
    if (!isPendingLegacyOrder) {
      return res.status(400).json({
        success: false,
        message: "Invalid subscription state for verification",
      });
    }

    await UserSubscription.updateMany(
      {
        userId: subscription.userId,
        fieldId: subscription.fieldId,
        status: "active",
        _id: { $ne: subscription._id },
      },
      { status: "expired" },
    );

    subscription.status = "active";
    subscription.razorpayPaymentId = razorpay_payment_id;
    subscription.razorpaySignature = razorpay_signature;
    subscription.startDate = new Date();

    await subscription.save();

    await createSubscriptionActivationNotification(subscription._id);

    await recordVerifyBillingEvent(
      subscription,
      razorpay_payment_id,
      razorpay_subscription_id,
      "legacy_order",
    );

    const farm = await FarmField.findById(subscription.fieldId);
    const plan = await SubscriptionPlan.findById(subscription.planId);

    return res.status(200).json({
      success: true,
      data: {
        subscriptionId: subscription._id,
        fieldName: farm?.fieldName,
        planName: plan?.name,
        transactionId: razorpay_payment_id,
        verifyType: "legacy_order",
      },
    });
  } catch (error) {
    console.error("Payment verification failed:", error);
    return res.status(500).json({
      success: false,
      message: "Payment verification failed",
    });
  }
};
