import BiodropsOrder from "../../models/biodrops-order.model.js";
import { formatBiodropsOrder } from "../../utils/formatOrder.js";
import {
  restoreStockForOrder,
} from "../../services/shopCheckout.service.js";
import { refundRazorpayPayment } from "../../../../services/razorpay.order.service.js";
import { logShopPaymentEvent } from "../../services/shopPaymentEvent.service.js";

function isTerminalOrder(order) {
  return (
    order.fulfillmentStatus === "cancelled" ||
    order.paymentStatus === "refunded"
  );
}

export const cancelCrmOrder = async (req, res) => {
  try {
    const order = await BiodropsOrder.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    if (isTerminalOrder(order)) {
      return res.status(400).json({
        success: false,
        message: "Order is already cancelled or refunded",
      });
    }

    const { mode = "cancel_only", reason = "" } = req.body;
    const actorId = req.user?.id || req.user?._id;

    if (!["cancel_only", "cancel_and_refund"].includes(mode)) {
      return res.status(400).json({
        success: false,
        message: "mode must be cancel_only or cancel_and_refund",
      });
    }

    order.fulfillmentStatus = "cancelled";
    order.cancelledAt = new Date();
    order.cancelledBy = actorId;
    order.cancelReason = String(reason || "").trim();

    if (order.paymentStatus === "paid" && mode === "cancel_and_refund") {
      if (!order.razorpayPaymentId) {
        return res.status(400).json({
          success: false,
          message: "No Razorpay payment ID on this order",
        });
      }

      const refund = await refundRazorpayPayment({
        razorpayPaymentId: order.razorpayPaymentId,
        amountMinor: order.totalMinor,
        notes: {
          biodropsOrderId: String(order._id),
          orderNumber: order.orderNumber,
        },
      });

      order.paymentStatus = "refunded";
      order.refundId = refund?.id || null;
      order.refundedAt = new Date();
      await restoreStockForOrder(order);

      await logShopPaymentEvent({
        order,
        razorpayEventId: `shop_refund_${order._id}_${refund?.id || Date.now()}`,
        eventType: "shop.refund.crm",
        razorpayPaymentId: order.razorpayPaymentId,
        refundId: refund?.id,
        amountMinor: order.totalMinor,
        status: "refunded",
      });
    } else if (order.paymentStatus === "paid" && mode === "cancel_only") {
      // Admin handles refund offline; restore stock for cancelled paid order
      await restoreStockForOrder(order);
    }

    await order.save();

    const populated = await BiodropsOrder.findById(order._id)
      .populate("userId", "firstName lastName phone email")
      .lean();

    return res.status(200).json({
      success: true,
      order: formatBiodropsOrder(populated, { includeUser: true }),
    });
  } catch (error) {
    const status = error.status || 500;
    if (status >= 500) console.error("cancelCrmOrder:", error);
    return res.status(status).json({
      success: false,
      message: error.message || "Failed to cancel order",
    });
  }
};
