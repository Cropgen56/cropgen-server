import crypto from "crypto";
import { coerceRazorpayError, getRazorpay } from "./razorpay.subscription.service.js";

export async function createRazorpayProductOrder({
  amountMinor,
  currency = "INR",
  receipt,
  notes = {},
}) {
  const razorpay = getRazorpay();
  const amount = Math.max(Number(amountMinor) || 0, 100);

  try {
    const order = await razorpay.orders.create({
      amount,
      currency: String(currency || "INR").toUpperCase(),
      receipt: String(receipt || `shop_${Date.now()}`).slice(0, 40),
      notes,
    });
    return order;
  } catch (err) {
    throw coerceRazorpayError(err);
  }
}

export function verifyRazorpayPaymentSignature({
  razorpayOrderId,
  razorpayPaymentId,
  razorpaySignature,
}) {
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!secret) return false;
  if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) return false;

  const body = `${razorpayOrderId}|${razorpayPaymentId}`;
  const expected = crypto
    .createHmac("sha256", secret)
    .update(body)
    .digest("hex");

  return expected === razorpaySignature;
}

export function getRazorpayKeyId() {
  return process.env.RAZORPAY_KEY_ID || "";
}

export async function refundRazorpayPayment({
  razorpayPaymentId,
  amountMinor,
  notes = {},
}) {
  const razorpay = getRazorpay();
  if (!razorpayPaymentId) {
    const err = new Error("Payment ID required for refund");
    err.status = 400;
    throw err;
  }

  try {
    const payload = { notes };
    if (amountMinor != null) {
      payload.amount = Math.max(Number(amountMinor) || 0, 100);
    }
    return await razorpay.payments.refund(razorpayPaymentId, payload);
  } catch (err) {
    throw coerceRazorpayError(err);
  }
}
