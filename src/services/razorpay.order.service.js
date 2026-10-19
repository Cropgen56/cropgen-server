import crypto from "crypto";
import {
  coerceRazorpayError,
  getRazorpay,
  getRazorpayCredentials,
  razorpayClientsFor,
  razorpaySignatureSecrets,
} from "./razorpay.subscription.service.js";

export async function createRazorpayProductOrder({
  amountMinor,
  currency = "INR",
  receipt,
  notes = {},
  brand,
}) {
  const razorpay = getRazorpay(brand);
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
  brand,
}) {
  const secrets = razorpaySignatureSecrets(brand);
  if (!secrets.length) return false;
  if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) return false;

  const body = `${razorpayOrderId}|${razorpayPaymentId}`;
  return secrets.some(
    (secret) =>
      crypto.createHmac("sha256", secret).update(body).digest("hex") ===
      razorpaySignature,
  );
}

export function getRazorpayKeyId(brand) {
  return getRazorpayCredentials(brand).keyId || "";
}

export async function refundRazorpayPayment({
  razorpayPaymentId,
  amountMinor,
  notes = {},
  brand,
}) {
  if (!razorpayPaymentId) {
    const err = new Error("Payment ID required for refund");
    err.status = 400;
    throw err;
  }

  const payload = { notes };
  if (amountMinor != null) {
    payload.amount = Math.max(Number(amountMinor) || 0, 100);
  }

  // A payment exists in exactly one Razorpay account; try the brand's own
  // account first, then the default one (payments taken before the switch).
  let firstError = null;
  for (const razorpay of razorpayClientsFor(brand)) {
    try {
      return await razorpay.payments.refund(razorpayPaymentId, payload);
    } catch (err) {
      firstError = firstError || err;
    }
  }
  throw coerceRazorpayError(firstError);
}
