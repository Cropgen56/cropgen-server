import { getRazorpayKeyId } from "../../../../services/razorpay.order.service.js";
import {
  cancelPendingClientCreditPurchase,
  createClientCreditPurchase,
  formatCreditPurchase,
  getClientCreditSummary,
  listClientPurchases,
  listClientUsage,
  listClientUsageByFarmer,
  listPlansForClient,
  verifyClientCreditPurchase,
} from "../../services/clientCredits.service.js";

/** Client viewer routes act only on the caller's own client organization. */
function clientIdOf(req) {
  return req.biodropsAdminActor?.clientOrganization;
}

function sendError(res, error, label, fallback) {
  // Razorpay errors are { statusCode, error: { description } }, not Errors.
  if (!error.status && error.statusCode) {
    console.error(`${label} (razorpay):`, error);
    return res.status(502).json({
      success: false,
      message: error.error?.description || "Payment gateway error. Please try again.",
    });
  }
  const status = error.status || 500;
  if (status >= 500) console.error(`${label}:`, error);
  return res.status(status).json({
    success: false,
    message: status >= 500 ? fallback : error.message,
  });
}

/** GET /crm/client-credits/me — balance, purchases and per-farmer usage. */
export async function getMyClientCredits(req, res) {
  try {
    const clientId = clientIdOf(req);
    const [summary, purchases, byFarmer] = await Promise.all([
      getClientCreditSummary(clientId),
      listClientPurchases(clientId),
      listClientUsageByFarmer(clientId),
    ]);
    return res.json({ success: true, summary, purchases, byFarmer });
  } catch (error) {
    return sendError(res, error, "getMyClientCredits", "Failed to load credits.");
  }
}

/** GET /crm/client-credits/me/plans */
export async function listMyClientCreditPlans(req, res) {
  try {
    const plans = await listPlansForClient(clientIdOf(req));
    return res.json({ success: true, plans });
  } catch (error) {
    return sendError(res, error, "listMyClientCreditPlans", "Failed to load plans.");
  }
}

/** GET /crm/client-credits/me/usage?page&limit&farmerId */
export async function listMyClientCreditUsage(req, res) {
  try {
    const usage = await listClientUsage(clientIdOf(req), req.query);
    return res.json({ success: true, ...usage });
  } catch (error) {
    return sendError(res, error, "listMyClientCreditUsage", "Failed to load usage.");
  }
}

/**
 * POST /crm/client-credits/me/purchases { planId }
 * Opens a Razorpay order, or — while Razorpay is disabled — activates the
 * plan immediately (razorpayOrder: null).
 */
export async function createMyClientCreditPurchase(req, res) {
  try {
    const { purchase, razorpayOrder } = await createClientCreditPurchase({
      clientId: clientIdOf(req),
      planId: req.body?.planId,
      userId: req.biodropsAdminActor?.id,
    });
    return res.status(201).json({
      success: true,
      purchase: formatCreditPurchase(purchase.toObject()),
      razorpayOrder: razorpayOrder
        ? {
            id: razorpayOrder.id,
            amount: razorpayOrder.amount,
            currency: razorpayOrder.currency,
          }
        : null,
      razorpayKeyId: razorpayOrder ? getRazorpayKeyId("biodrops") : null,
    });
  } catch (error) {
    return sendError(res, error, "createMyClientCreditPurchase", "Failed to start payment.");
  }
}

/** POST /crm/client-credits/me/purchases/:id/verify */
export async function verifyMyClientCreditPurchase(req, res) {
  try {
    const body = req.body || {};
    const { purchase, alreadyPaid } = await verifyClientCreditPurchase({
      clientId: clientIdOf(req),
      purchaseId: req.params.id,
      razorpayOrderId: body.razorpay_order_id || body.razorpayOrderId,
      razorpayPaymentId: body.razorpay_payment_id || body.razorpayPaymentId,
      razorpaySignature: body.razorpay_signature || body.razorpaySignature,
    });
    return res.json({
      success: true,
      alreadyPaid,
      purchase: formatCreditPurchase(purchase.toObject ? purchase.toObject() : purchase),
    });
  } catch (error) {
    return sendError(res, error, "verifyMyClientCreditPurchase", "Payment verification failed.");
  }
}

/** POST /crm/client-credits/me/purchases/:id/cancel — checkout dismissed. */
export async function cancelMyClientCreditPurchase(req, res) {
  try {
    await cancelPendingClientCreditPurchase({
      clientId: clientIdOf(req),
      purchaseId: req.params.id,
    });
    return res.json({ success: true });
  } catch (error) {
    return sendError(res, error, "cancelMyClientCreditPurchase", "Failed to cancel purchase.");
  }
}
