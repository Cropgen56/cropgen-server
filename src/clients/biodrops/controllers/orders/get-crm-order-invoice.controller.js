import BiodropsOrder from "../../models/biodrops-order.model.js";
import { formatBiodropsOrder } from "../../utils/formatOrder.js";
import { buildShopInvoiceHtml } from "../../utils/shopInvoice.util.js";

export const getCrmOrderInvoice = async (req, res) => {
  try {
    const order = await BiodropsOrder.findById(req.params.id)
      .populate("userId", "firstName lastName phone email")
      .lean();

    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    if (!["paid", "refunded"].includes(order.paymentStatus)) {
      return res.status(400).json({
        success: false,
        message: "Invoice available only for paid or refunded orders",
      });
    }

    const formatted = formatBiodropsOrder(order, { includeUser: true });

    if (req.path.endsWith("/html")) {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.status(200).send(buildShopInvoiceHtml(formatted));
    }

    return res.status(200).json({
      success: true,
      invoice: {
        orderNumber: formatted.orderNumber,
        issuedAt: formatted.paidAt || formatted.createdAt,
        farmer: formatted.farmer,
        shippingAddress: formatted.shippingAddress,
        items: formatted.items,
        subtotalMinor: formatted.subtotalMinor,
        shippingMinor: formatted.shippingMinor,
        totalMinor: formatted.totalMinor,
        currency: formatted.currency,
        razorpayPaymentId: formatted.razorpayPaymentId,
        paymentStatus: formatted.paymentStatus,
      },
    });
  } catch (error) {
    console.error("getCrmOrderInvoice:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to generate invoice",
    });
  }
};
