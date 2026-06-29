import BiodropsShopPaymentEvent from "../models/biodrops-shop-payment-event.model.js";

export async function logShopPaymentEvent({
  order,
  razorpayEventId,
  eventType,
  razorpayPaymentId,
  razorpayOrderId,
  refundId,
  amountMinor,
  currency,
  status,
  payloadSummary,
}) {
  if (!razorpayEventId) return null;

  try {
    return await BiodropsShopPaymentEvent.create({
      orderId: order?._id,
      userId: order?.userId,
      orderNumber: order?.orderNumber,
      razorpayEventId,
      eventType,
      razorpayPaymentId: razorpayPaymentId || null,
      razorpayOrderId: razorpayOrderId || order?.razorpayOrderId || null,
      refundId: refundId || null,
      amountMinor: amountMinor ?? order?.totalMinor ?? null,
      currency: currency || order?.currency || "INR",
      status: status || "captured",
      payloadSummary: payloadSummary || null,
    });
  } catch (e) {
    if (e?.code === 11000) return null;
    console.error("logShopPaymentEvent:", e);
    return null;
  }
}
