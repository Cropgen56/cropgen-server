import {
  assertCrmSubscriptionAccess,
  approveCardRemainderSubscription,
} from "../../services/crmSubscription.service.js";
import { formatCrmSubscriptionRow } from "../../utils/subscriptionRowFormat.js";
import UserSubscription from "../../../../models/user-subscription.model.js";

export async function approveCrmCardRemainder(req, res) {
  try {
    const { id } = req.params;
    const adminId = req.user?.id || req.user?._id;

    await assertCrmSubscriptionAccess(req, id);

    const subscription = await approveCardRemainderSubscription(id, adminId);

    const populated = await UserSubscription.findById(subscription._id)
      .populate("userId", "firstName lastName phone email avatar village district state")
      .populate("fieldId", "fieldName acre cropName")
      .populate("planId", "name slug brand platform isInternal")
      .lean();

    return res.status(200).json({
      success: true,
      message: "Remaining acres approved. Field is now unlocked for the farmer.",
      data: formatCrmSubscriptionRow(populated),
    });
  } catch (error) {
    const statusCode = error.status || 500;
    if (statusCode >= 500) console.error("approveCrmCardRemainder:", error);
    return res.status(statusCode).json({
      success: false,
      message: error.message || "Failed to approve card remainder",
    });
  }
}
