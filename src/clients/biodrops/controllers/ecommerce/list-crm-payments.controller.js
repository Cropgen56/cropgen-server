import BiodropsShopPaymentEvent from "../../models/biodrops-shop-payment-event.model.js";

export const listCrmShopPayments = async (req, res) => {
  try {
    const { page = 1, limit = 20, search, status } = req.query;
    const parsedLimit = Math.max(1, Math.min(100, parseInt(limit, 10) || 20));
    const parsedPage = Math.max(1, parseInt(page, 10) || 1);
    const skip = (parsedPage - 1) * parsedLimit;

    const query = {};
    if (status && ["captured", "refunded", "failed", "pending"].includes(status)) {
      query.status = status;
    }

    if (search?.trim()) {
      const q = search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      query.$or = [
        { orderNumber: { $regex: q, $options: "i" } },
        { razorpayPaymentId: { $regex: q, $options: "i" } },
        { razorpayOrderId: { $regex: q, $options: "i" } },
      ];
    }

    const [events, total] = await Promise.all([
      BiodropsShopPaymentEvent.find(query)
        .sort({ createdAt: -1 })
        .populate("userId", "firstName lastName phone email")
        .skip(skip)
        .limit(parsedLimit)
        .lean(),
      BiodropsShopPaymentEvent.countDocuments(query),
    ]);

    const payments = events.map((e) => ({
      id: String(e._id),
      orderId: e.orderId ? String(e.orderId) : null,
      orderNumber: e.orderNumber,
      userId: e.userId?._id ? String(e.userId._id) : String(e.userId || ""),
      farmer: e.userId && typeof e.userId === "object"
        ? {
            firstName: e.userId.firstName,
            lastName: e.userId.lastName,
            phone: e.userId.phone,
            email: e.userId.email,
          }
        : null,
      eventType: e.eventType,
      razorpayPaymentId: e.razorpayPaymentId,
      razorpayOrderId: e.razorpayOrderId,
      refundId: e.refundId,
      amountMinor: e.amountMinor,
      amount: e.amountMinor != null ? e.amountMinor / 100 : null,
      currency: e.currency,
      status: e.status,
      createdAt: e.createdAt,
    }));

    return res.status(200).json({
      success: true,
      payments,
      pagination: {
        page: parsedPage,
        currentPage: parsedPage,
        totalPages: Math.max(1, Math.ceil(total / parsedLimit)),
        total,
        limit: parsedLimit,
      },
    });
  } catch (error) {
    console.error("listCrmShopPayments:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to load payments",
    });
  }
};
