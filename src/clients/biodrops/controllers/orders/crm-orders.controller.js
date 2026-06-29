import BiodropsOrder from "../../models/biodrops-order.model.js";
import { formatBiodropsOrder } from "../../utils/formatOrder.js";

export const getCrmOrderStats = async (req, res) => {
  try {
    const [total, paid, pending, cancelled] = await Promise.all([
      BiodropsOrder.countDocuments(),
      BiodropsOrder.countDocuments({ paymentStatus: "paid" }),
      BiodropsOrder.countDocuments({ paymentStatus: "pending" }),
      BiodropsOrder.countDocuments({ fulfillmentStatus: "cancelled" }),
    ]);

    return res.status(200).json({
      success: true,
      stats: { total, paid, pending, cancelled },
    });
  } catch (error) {
    console.error("getCrmOrderStats:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to load order stats",
    });
  }
};

export const listCrmOrders = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      paymentStatus,
      fulfillmentStatus,
      search,
    } = req.query;

    const parsedLimit = Math.max(1, Math.min(100, parseInt(limit, 10) || 20));
    const parsedPage = Math.max(1, parseInt(page, 10) || 1);
    const skip = (parsedPage - 1) * parsedLimit;

    const query = {};
    if (
      paymentStatus &&
      ["pending", "paid", "failed", "refunded"].includes(paymentStatus)
    ) {
      query.paymentStatus = paymentStatus;
    }
    if (
      fulfillmentStatus &&
      ["pending", "confirmed", "shipped", "delivered", "cancelled"].includes(
        fulfillmentStatus,
      )
    ) {
      query.fulfillmentStatus = fulfillmentStatus;
    }

    if (search?.trim()) {
      const q = search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      query.$or = [
        { orderNumber: { $regex: q, $options: "i" } },
        { "shippingAddress.name": { $regex: q, $options: "i" } },
        { "shippingAddress.phone": { $regex: q, $options: "i" } },
      ];
    }

    const [orders, total] = await Promise.all([
      BiodropsOrder.find(query)
        .sort({ createdAt: -1 })
        .populate("userId", "firstName lastName phone email")
        .skip(skip)
        .limit(parsedLimit)
        .lean(),
      BiodropsOrder.countDocuments(query),
    ]);

    return res.status(200).json({
      success: true,
      orders: orders.map((o) => formatBiodropsOrder(o, { includeUser: true })),
      pagination: {
        page: parsedPage,
        currentPage: parsedPage,
        totalPages: Math.max(1, Math.ceil(total / parsedLimit)),
        total,
        limit: parsedLimit,
      },
    });
  } catch (error) {
    console.error("listCrmOrders:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to load orders.",
    });
  }
};

export const getCrmOrderById = async (req, res) => {
  try {
    const order = await BiodropsOrder.findById(req.params.id)
      .populate("userId", "firstName lastName phone email")
      .lean();

    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    return res.status(200).json({
      success: true,
      order: formatBiodropsOrder(order, { includeUser: true }),
    });
  } catch (error) {
    console.error("getCrmOrderById:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to load order.",
    });
  }
};

export const updateCrmOrder = async (req, res) => {
  try {
    const order = await BiodropsOrder.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    const { fulfillmentStatus, adminNotes } = req.body;

    if (
      fulfillmentStatus &&
      ["pending", "confirmed", "shipped", "delivered", "cancelled"].includes(
        fulfillmentStatus,
      )
    ) {
      order.fulfillmentStatus = fulfillmentStatus;
    }

    if (adminNotes !== undefined) {
      order.adminNotes = String(adminNotes);
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
    console.error("updateCrmOrder:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to update order.",
    });
  }
};
