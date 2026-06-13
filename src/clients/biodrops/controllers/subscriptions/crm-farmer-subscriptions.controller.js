import UserSubscription from "../../../../models/user-subscription.model.js";
import {
  assertCrmFarmerAccess,
  activateEnterpriseFarmSubscription,
} from "../../services/crmSubscription.service.js";
import { formatCrmSubscriptionRow } from "../../utils/subscriptionRowFormat.js";

export async function listCrmFarmerSubscriptions(req, res) {
  try {
    const { id: farmerId } = req.params;
    await assertCrmFarmerAccess(req, farmerId);

    const rows = await UserSubscription.find({ userId: farmerId })
      .sort({ createdAt: -1 })
      .populate("userId", "firstName lastName phone email avatar village district state")
      .populate("fieldId", "fieldName acre cropName")
      .populate("planId", "name slug brand platform isInternal")
      .lean();

    return res.status(200).json({
      success: true,
      data: rows.map(formatCrmSubscriptionRow),
    });
  } catch (error) {
    const statusCode = error.status || 500;
    if (statusCode >= 500) console.error("listCrmFarmerSubscriptions:", error);
    return res.status(statusCode).json({
      success: false,
      message: error.message || "Failed to load farmer subscriptions",
    });
  }
}

export async function activateCrmFarmerSubscription(req, res) {
  try {
    const { id: farmerId } = req.params;
    const { farmId, planId, billingCycle } = req.body || {};
    const adminId = req.user?.id || req.user?._id;

    if (!farmId || !planId || !billingCycle) {
      return res.status(400).json({
        success: false,
        message: "farmId, planId, and billingCycle are required",
      });
    }

    await assertCrmFarmerAccess(req, farmerId);

    const subscription = await activateEnterpriseFarmSubscription({
      farmerId,
      farmId,
      planId,
      billingCycle,
      adminId,
    });

    const populated = await UserSubscription.findById(subscription._id)
      .populate("userId", "firstName lastName phone email avatar village district state")
      .populate("fieldId", "fieldName acre cropName")
      .populate("planId", "name slug brand platform isInternal")
      .lean();

    return res.status(201).json({
      success: true,
      message: "Enterprise subscription enabled for farmer",
      data: formatCrmSubscriptionRow(populated),
    });
  } catch (error) {
    const statusCode = error.status || 500;
    if (statusCode >= 500) console.error("activateCrmFarmerSubscription:", error);
    return res.status(statusCode).json({
      success: false,
      message: error.message || "Failed to enable subscription",
    });
  }
}
