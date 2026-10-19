import UserSubscription from "../../models/user-subscription.model.js";
import SubscriptionPlan from "../../models/subscription-plan.model.js";
import FarmField from "../../models/field.model.js";
import { createSubscriptionActivationNotification } from "../../services/notification.service.js";

const DEMO_BILLING_CYCLE = "season";
const DEMO_DURATION_DAYS = 120;

async function resolveDemoPlan() {
  if (process.env.DEMO_PLAN_ID) {
    const byId = await SubscriptionPlan.findOne({
      _id: process.env.DEMO_PLAN_ID,
      active: true,
    });
    if (byId) return byId;
  }

  return SubscriptionPlan.findOne({
    brand: "cropgen",
    platform: "web",
    active: true,
  }).sort({ isInternal: -1, createdAt: -1 });
}

/**
 * Activate real subscriptions for every field of the logged-in user
 * when a valid DEMO_ACCESS_KEY is provided.
 *
 * POST /subscription/demo-activate-all
 * body: { key }
 */
export const demoActivateAllSubscriptions = async (req, res) => {
  try {
    const userId = req.user?.id;
    const { key } = req.body || {};

    const expectedKey = process.env.DEMO_ACCESS_KEY;
    if (!expectedKey) {
      return res.status(503).json({
        success: false,
        message: "Demo activation is not configured",
      });
    }

    if (!key || key !== expectedKey) {
      return res.status(403).json({
        success: false,
        message: "Invalid demo access key",
      });
    }

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const plan = await resolveDemoPlan();
    if (!plan) {
      return res.status(404).json({
        success: false,
        message: "No active demo subscription plan found",
      });
    }

    const farms = await FarmField.find({ user: userId }).lean();
    if (!farms.length) {
      return res.status(200).json({
        success: true,
        message: "No farms found for this user",
        activatedCount: 0,
        skippedCount: 0,
      });
    }

    const now = new Date();
    const fieldIds = farms.map((f) => f._id);

    const activeSubs = await UserSubscription.find({
      userId,
      fieldId: { $in: fieldIds },
      status: "active",
      $or: [{ endDate: null }, { endDate: { $gte: now } }],
    })
      .select("fieldId")
      .lean();

    const alreadyActive = new Set(
      activeSubs.map((s) => String(s.fieldId)),
    );

    let activatedCount = 0;
    let skippedCount = 0;
    const activatedIds = [];

    for (const farm of farms) {
      const fieldId = farm._id;

      if (alreadyActive.has(String(fieldId))) {
        skippedCount += 1;
        continue;
      }

      const area = Number(farm.acre) || 1;
      const startDate = new Date();
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + DEMO_DURATION_DAYS);

      await UserSubscription.updateMany(
        { userId, fieldId, status: "active" },
        { status: "expired" },
      );

      const subscription = await UserSubscription.create({
        userId,
        fieldId,
        planId: plan._id,
        platform: plan.platform,
        area,
        unit: "acre",

        billingCycle: DEMO_BILLING_CYCLE,
        displayCurrency: null,
        pricePerUnitMinor: 0,
        totalAmountMinor: 0,

        chargedCurrency: null,
        exchangeRate: null,

        status: "active",
        startDate,
        endDate,

        billingMode: "legacy_order",
        activationSource: "demo_key",
        activatedByAdmin: false,
        activatedBy: null,
      });

      try {
        await createSubscriptionActivationNotification(subscription._id);
      } catch (notifyErr) {
        console.error(
          "Demo activation notification failed:",
          notifyErr?.message || notifyErr,
        );
      }

      activatedIds.push(subscription._id);
      activatedCount += 1;
    }

    return res.status(201).json({
      success: true,
      message: "Demo subscriptions activated",
      activatedCount,
      skippedCount,
      planId: plan._id,
      billingCycle: DEMO_BILLING_CYCLE,
      subscriptionIds: activatedIds,
    });
  } catch (error) {
    console.error("Demo activate-all failed:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to activate demo subscriptions",
    });
  }
};
