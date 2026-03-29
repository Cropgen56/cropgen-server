import mongoose from "mongoose";
import UserSubscription from "../../models/usersubscription.model.js";
import SubscriptionBillingEvent from "../../models/subscriptionBillingEvent.model.js";
import {
  getRazorpay,
  cancelRazorpaySubscriptionBestEffort,
} from "../../services/razorpay.subscription.service.js";

const razorpay = getRazorpay();

async function summarizeRazorpayPayment(paymentId) {
  if (!paymentId || typeof paymentId !== "string") return null;
  try {
    const p = await razorpay.payments.fetch(paymentId);
    const amount = Number(p.amount);
    const refunded = Number(p.amount_refunded || 0);
    return {
      id: p.id,
      amount,
      amountRefunded: refunded,
      currency: p.currency || "INR",
      status: p.status,
      method: p.method,
      captured: Boolean(p.captured),
      netRetained: Math.max(0, amount - refunded),
      refundLabel:
        refunded <= 0
          ? "not_refunded"
          : refunded >= amount
            ? "fully_refunded"
            : "partially_refunded",
      createdAt: p.created_at
        ? new Date(p.created_at * 1000).toISOString()
        : null,
    };
  } catch (e) {
    return {
      id: paymentId,
      fetchError: true,
      message: e?.error?.description || e?.message || "Could not fetch payment",
    };
  }
}

/**
 * Admin: subscription + billing ledger + Razorpay payment summaries (refund status).
 */
export const getSubscriptionAdminDetail = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid subscription ID",
      });
    }

    const subscription = await UserSubscription.findById(id)
      .populate("userId", "firstName lastName email phone")
      .populate(
        "fieldId",
        "fieldName acre cropName variety sowingDate typeOfFarming typeOfIrrigation",
      )
      .populate(
        "planId",
        "name slug description platform pricing isTrialEnabled trialDays active",
      )
      .populate("postTrialPlanId", "name slug")
      .lean();

    if (!subscription) {
      return res.status(404).json({
        success: false,
        message: "Subscription not found",
      });
    }

    const billingEvents = await SubscriptionBillingEvent.find({
      userSubscriptionId: id,
    })
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();

    const paymentIds = new Set();
    if (subscription.razorpayPaymentId) {
      paymentIds.add(subscription.razorpayPaymentId);
    }
    for (const ev of billingEvents) {
      if (ev.razorpayPaymentId) paymentIds.add(ev.razorpayPaymentId);
    }

    const payments = [];
    for (const pid of paymentIds) {
      const summary = await summarizeRazorpayPayment(pid);
      if (summary) payments.push(summary);
    }

    return res.status(200).json({
      success: true,
      data: {
        subscription,
        billingEvents,
        razorpayPayments: payments,
        razorpaySubscriptionId: subscription.razorpaySubscriptionId || null,
        razorpayPlanId: subscription.razorpayPlanId || null,
        razorpayOrderId: subscription.razorpayOrderId || null,
      },
    });
  } catch (error) {
    console.error("getSubscriptionAdminDetail:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to load subscription detail",
    });
  }
};

/**
 * Admin: cancel Razorpay subscription (best effort) and mark row cancelled.
 */
export const cancelSubscriptionAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid subscription ID",
      });
    }

    const subscription = await UserSubscription.findById(id);
    if (!subscription) {
      return res.status(404).json({
        success: false,
        message: "Subscription not found",
      });
    }

    if (subscription.status === "cancelled") {
      return res.status(400).json({
        success: false,
        message: "Subscription is already cancelled",
      });
    }

    await cancelRazorpaySubscriptionBestEffort(
      razorpay,
      subscription.razorpaySubscriptionId,
    );

    subscription.status = "cancelled";
    await subscription.save();

    return res.status(200).json({
      success: true,
      message: "Subscription cancelled. Razorpay recurring stopped where applicable.",
      data: { id: subscription._id, status: subscription.status },
    });
  } catch (error) {
    console.error("cancelSubscriptionAdmin:", error);
    return res.status(500).json({
      success: false,
      message: error?.message || "Failed to cancel subscription",
    });
  }
};
