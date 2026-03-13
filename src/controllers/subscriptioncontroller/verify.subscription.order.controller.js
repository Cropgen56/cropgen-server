import crypto from "crypto";
import UserSubscription from "../../models/usersubscription.model.js";
import FarmField from "../../models/field.model.js";
import SubscriptionPlan from "../../models/subscriptionplan.model.js";
import { createSubscriptionActivationNotification } from "../../services/notification.service.js";

export const verifySubscriptionOrder = async (req, res) => {
  try {
    const {
      subscriptionId,
      razorpay_payment_id,
      razorpay_order_id,
      razorpay_signature,
    } = req.body;

    if (
      !subscriptionId ||
      !razorpay_payment_id ||
      !razorpay_order_id ||
      !razorpay_signature
    ) {
      return res.status(400).json({
        success: false,
        message: "Missing Razorpay verification fields",
      });
    }

    /* ================= 1. FETCH SUBSCRIPTION ================= */
    const subscription = await UserSubscription.findById(subscriptionId);

    if (!subscription) {
      return res.status(404).json({
        success: false,
        message: "Subscription not found",
      });
    }

    /* ================= PREVENT DOUBLE ACTIVATION ================= */
    if (subscription.status === "active") {
      return res.status(400).json({
        success: false,
        message: "Subscription already activated",
      });
    }

    /* ================= 2. VERIFY SIGNATURE ================= */
    const generatedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    if (generatedSignature !== razorpay_signature) {
      return res.status(400).json({
        success: false,
        message: "Invalid payment signature",
      });
    }

    /* ================= EXPIRE OLD ACTIVE PLANS ================= */
    await UserSubscription.updateMany(
      {
        userId: subscription.userId,
        fieldId: subscription.fieldId,
        status: "active",
        _id: { $ne: subscription._id },
      },
      { status: "expired" },
    );

    /* ================= ACTIVATE SUBSCRIPTION ================= */
    subscription.status = "active";
    subscription.razorpayPaymentId = razorpay_payment_id;
    subscription.razorpaySignature = razorpay_signature;
    subscription.startDate = new Date();

    await subscription.save();

    /* ================= CREATE NOTIFICATION ================= */
    await createSubscriptionActivationNotification(subscription._id);

    /* ================= 4. RESPONSE DATA ================= */
    const farm = await FarmField.findById(subscription.fieldId);
    const plan = await SubscriptionPlan.findById(subscription.planId);

    return res.status(200).json({
      success: true,
      data: {
        subscriptionId: subscription._id,
        fieldName: farm?.fieldName,
        planName: plan?.name,
        transactionId: razorpay_payment_id,
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
