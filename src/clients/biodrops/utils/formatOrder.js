export function formatBiodropsOrder(doc, { includeUser = false } = {}) {
  if (!doc) return null;
  const o = doc.toObject ? doc.toObject() : doc;
  const formatted = {
    id: String(o._id),
    orderNumber: o.orderNumber,
    userId: String(o.userId),
    items: (o.items || []).map((item) => ({
      productId: String(item.productId),
      sku: item.sku,
      name: item.name,
      quantity: item.quantity,
      unitPriceMinor: item.unitPriceMinor,
      unitPrice: item.unitPriceMinor / 100,
      lineTotalMinor: item.lineTotalMinor,
      lineTotal: item.lineTotalMinor / 100,
    })),
    shippingAddress: o.shippingAddress,
    subtotalMinor: o.subtotalMinor,
    subtotal: o.subtotalMinor / 100,
    shippingMinor: o.shippingMinor ?? 0,
    shipping: (o.shippingMinor ?? 0) / 100,
    totalMinor: o.totalMinor,
    total: o.totalMinor / 100,
    currency: o.currency || "INR",
    paymentStatus: o.paymentStatus,
    paymentMethod: o.paymentMethod || "online",
    fulfillmentStatus: o.fulfillmentStatus,
    razorpayOrderId: o.razorpayOrderId,
    razorpayPaymentId: o.razorpayPaymentId,
    paidAt: o.paidAt,
    cancelledAt: o.cancelledAt,
    cancelReason: o.cancelReason || "",
    refundId: o.refundId,
    refundedAt: o.refundedAt,
    notes: o.notes || "",
    adminNotes: o.adminNotes || "",
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
  };

  if (includeUser && o.userId && typeof o.userId === "object") {
    const u = o.userId;
    formatted.farmer = {
      id: String(u._id),
      firstName: u.firstName || "",
      lastName: u.lastName || "",
      phone: u.phone || "",
      email: u.email || "",
    };
    formatted.userId = String(u._id);
  }

  return formatted;
}
