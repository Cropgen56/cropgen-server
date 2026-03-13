import Razorpay from "razorpay";
import FarmField from "../../models/field.model.js";
import SubscriptionPlan from "../../models/subscriptionplan.model.js";
import UserSubscription from "../../models/usersubscription.model.js";
import { createSubscriptionActivationNotification } from "../../services/notification.service.js";

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

export const createSubscriptionOrder = async (req, res) => {
  try {
    const userId = req.user?.id || req.user?._id;
    const { farmId, planId, billingCycle, displayCurrency } = req.body;

    /* ================= 1️⃣ FARM ================= */
    const farm = await FarmField.findOne({
      _id: farmId,
      user: userId,
    });

    if (!farm) {
      return res.status(404).json({ message: "Farm not found" });
    }

    /* ================= 2️⃣ PLAN ================= */
    const plan = await SubscriptionPlan.findOne({
      _id: planId,
      active: true,
    });

    if (!plan) {
      return res.status(404).json({ message: "Plan not found" });
    }

    const area = Number(farm.acre) || 1;
    const startDate = new Date();

    /* =================================================
   3️⃣ TRIAL FLOW (NO PAYMENT)
    ================================================= */
    if (billingCycle === "trial") {
      if (!plan.isTrialEnabled) {
        return res
          .status(400)
          .json({ message: "Trial not available for this plan" });
      }

      const existingTrial = await UserSubscription.findOne({
        userId,
        billingCycle: "trial",
      }).lean();

      if (existingTrial) {
        return res.status(400).json({
          message:
            "Free trial is available only for your first farm. Please choose a paid plan for additional farms.",
        });
      }

      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + plan.trialDays);

      try {
        const subscription = await UserSubscription.create({
          userId,
          fieldId: farmId,
          planId,
          platform: plan.platform,
          area,
          unit: "acre",
          billingCycle: "trial",

          displayCurrency: null,
          pricePerUnitMinor: 0,
          totalAmountMinor: 0,
          chargedCurrency: null,
          exchangeRate: null,

          status: "active",
          startDate,
          endDate,
        });

        await createSubscriptionActivationNotification(subscription?._id);

        return res.status(201).json({
          success: true,
          type: "trial",
          subscriptionId: subscription._id,
          startDate,
          endDate,
          daysLeft: plan.trialDays,
        });
      } catch (error) {
        // Duplicate trial protection for concurrent requests.
        if (error.code === 11000) {
          return res.status(400).json({
            message:
              "Free trial is available only for your first farm. Please choose a paid plan for additional farms.",
          });
        }

        console.error("Trial creation failed:", error);
        return res.status(500).json({
          message: "Failed to create trial subscription",
        });
      }
    }

    /* =================================================
       4️⃣ PAID FLOW (RAZORPAY)
    ================================================= */

    if (!displayCurrency) {
      return res.status(400).json({ message: "Currency is required" });
    }

    const pricing = plan.pricing.find(
      (p) => p.currency === displayCurrency && p.billingCycle === billingCycle,
    );

    if (!pricing) {
      return res.status(400).json({ message: "Pricing not found" });
    }

    /* ---- Calculate display amount ---- */
    const displayAmountMinor = Math.round(area * pricing.pricePerUnitMinor);

    let chargedAmountMinor = displayAmountMinor;
    let exchangeRate = null;

    /* ---- USD → INR Conversion ---- */
    if (displayCurrency === "USD") {
      exchangeRate = 91.46;
      chargedAmountMinor = Math.round(
        (displayAmountMinor / 100) * exchangeRate * 100,
      );
    }

    /* =================================================
       ✅ MINIMUM ₹1 SAFETY FIX (100 paise)
    ================================================= */
    if (chargedAmountMinor < 100) {
      console.log(`Amount too low (${chargedAmountMinor}). Adjusted to ₹1.`);
      chargedAmountMinor = 100;
    }

    /* ---- End Date Calculation ---- */
    const endDate = new Date(startDate);

    if (billingCycle === "monthly") {
      endDate.setDate(endDate.getDate() + 30);
    }

    if (billingCycle === "yearly") {
      endDate.setDate(endDate.getDate() + 365);
    }

    if (billingCycle === "season") {
      endDate.setDate(endDate.getDate() + 120);
    }

    /* ---- Create Pending Subscription ---- */
    const subscription = await UserSubscription.create({
      userId,
      fieldId: farmId,
      planId,
      platform: plan.platform,
      area,
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
    });

    /* ---- Razorpay Order ---- */
    const order = await razorpay.orders.create({
      amount: chargedAmountMinor,
      currency: "INR",
      receipt: `sub_${subscription._id.toString().slice(-10)}`,
    });

    subscription.razorpayOrderId = order.id;
    await subscription.save();

    return res.status(201).json({
      success: true,
      type: "payment",
      order: {
        id: order.id,
        amount: chargedAmountMinor,
        currency: "INR",
        key: process.env.RAZORPAY_KEY_ID,
      },
      subscriptionId: subscription._id,
      startDate,
      endDate,
    });
  } catch (error) {
    console.error("Create subscription order failed:", error);
    return res
      .status(500)
      .json({ message: "Failed to create subscription order" });
  }
};
