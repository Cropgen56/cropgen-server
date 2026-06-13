import {
  assertCrmSubscriptionAccess,
  cancelEnterpriseFarmSubscription,
} from "../../services/crmSubscription.service.js";
import { formatCrmSubscriptionRow } from "../../utils/subscriptionRowFormat.js";
import UserSubscription from "../../../../models/user-subscription.model.js";

export async function cancelCrmSubscription(req, res) {
  try {
    const { id } = req.params;
    await assertCrmSubscriptionAccess(req, id);

    const subscription = await cancelEnterpriseFarmSubscription(id);

    const populated = await UserSubscription.findById(subscription._id)
      .populate("userId", "firstName lastName phone email avatar village district state")
      .populate("fieldId", "fieldName acre cropName")
      .populate("planId", "name slug brand platform isInternal")
      .lean();

    return res.status(200).json({
      success: true,
      message: "Subscription cancelled. Field access will end when the subscription expires or on next sync.",
      data: formatCrmSubscriptionRow(populated),
    });
  } catch (error) {
    const statusCode = error.status || 500;
    if (statusCode >= 500) console.error("cancelCrmSubscription:", error);
    return res.status(statusCode).json({
      success: false,
      message: error.message || "Failed to cancel subscription",
    });
  }
}
