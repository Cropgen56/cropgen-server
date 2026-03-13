import UserSubscription from "../../models/usersubscription.model.js";
import SubscriptionPlan from "../../models/subscriptionplan.model.js";
import FarmField from "../../models/field.model.js";
import { createSubscriptionActivationNotification } from "../../services/notification.service.js";

export const activateSubscriptionManually = async (req, res) => {
  try {
    const adminId = req.user?.id;

    if (req.user.role !== "admin") {
      return res.status(403).json({
        message: "Only admin can activate subscription manually",
      });
    }

    const { userId, farmId, planId, billingCycle } = req.body;

    /* ================= PLAN ================= */
    const plan = await SubscriptionPlan.findOne({
      _id: planId,
      active: true,
    });

    if (!plan) {
      return res.status(404).json({ message: "Plan not found" });
    }

    /* ================= FARM ================= */
    const farm = await FarmField.findOne({
      _id: farmId,
      user: userId,
    });

    if (!farm) {
      return res.status(404).json({ message: "Farm not found" });
    }

    const area = Number(farm.acre) || 1;
    const startDate = new Date();
    const endDate = new Date(startDate);

    /* ===== Billing Cycle Duration ===== */
    if (billingCycle === "monthly") {
      endDate.setDate(endDate.getDate() + 30);
    }

    if (billingCycle === "yearly") {
      endDate.setDate(endDate.getDate() + 365);
    }

    if (billingCycle === "season") {
      endDate.setDate(endDate.getDate() + 120);
    }

    /* ===== Deactivate Old Active Plan ===== */
    await UserSubscription.updateMany(
      { userId, fieldId: farmId, status: "active" },
      { status: "expired" },
    );

    /* ===== Create Active Subscription ===== */
    const subscription = await UserSubscription.create({
      userId,
      fieldId: farmId,
      planId,
      platform: plan.platform,
      area,
      unit: "acre",

      billingCycle,
      displayCurrency: null,
      pricePerUnitMinor: 0,
      totalAmountMinor: 0,

      chargedCurrency: null,
      exchangeRate: null,

      status: "active",
      startDate,
      endDate,

      activatedByAdmin: true,
      activatedBy: adminId,
    });

    await createSubscriptionActivationNotification(subscription._id);

    return res.status(201).json({
      success: true,
      message: "Subscription activated manually",
      subscriptionId: subscription._id,
      startDate,
      endDate,
    });
  } catch (error) {
    console.error("Manual activation failed:", error);
    return res.status(500).json({
      message: "Failed to activate subscription",
    });
  }
};
