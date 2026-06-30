import BiodropsProduct from "../models/biodrops-product.model.js";
import BiodropsOrder from "../models/biodrops-order.model.js";
import { generateBiodropsOrderNumber } from "./orderNumber.service.js";
import {
  createRazorpayProductOrder,
  verifyRazorpayPaymentSignature,
} from "../../../services/razorpay.order.service.js";
import { logShopPaymentEvent } from "./shopPaymentEvent.service.js";
import { clearUserCart } from "./shopCart.service.js";

const SHIPPING_MINOR = 0;

function normalizeSku(sku) {
  return String(sku || "")
    .trim()
    .toLowerCase();
}

export async function resolveCartItems(items = []) {
  if (!Array.isArray(items) || !items.length) {
    const err = new Error("Cart is empty");
    err.status = 400;
    throw err;
  }

  const skuQty = new Map();
  for (const row of items) {
    const sku = normalizeSku(row.sku);
    const qty = Math.max(1, parseInt(row.quantity, 10) || 1);
    if (!sku) {
      const err = new Error("Each cart item must include a sku");
      err.status = 400;
      throw err;
    }
    skuQty.set(sku, (skuQty.get(sku) || 0) + qty);
  }

  const skus = [...skuQty.keys()];
  const products = await BiodropsProduct.find({
    sku: { $in: skus },
    status: "active",
  }).lean();

  if (products.length !== skus.length) {
    const found = new Set(products.map((p) => p.sku));
    const missing = skus.filter((s) => !found.has(s));
    const err = new Error(`Products not available: ${missing.join(", ")}`);
    err.status = 400;
    throw err;
  }

  const resolved = [];
  let subtotalMinor = 0;

  for (const product of products) {
    const quantity = skuQty.get(product.sku);
    if (
      product.stockQuantity != null &&
      product.stockQuantity < quantity
    ) {
      const err = new Error(`Insufficient stock for ${product.name}`);
      err.status = 400;
      throw err;
    }
    const lineTotalMinor = product.priceMinor * quantity;
    subtotalMinor += lineTotalMinor;
    resolved.push({
      productId: product._id,
      sku: product.sku,
      name: product.name,
      quantity,
      unitPriceMinor: product.priceMinor,
      lineTotalMinor,
      stockQuantity: product.stockQuantity,
    });
  }

  const totalMinor = subtotalMinor + SHIPPING_MINOR;

  return {
    items: resolved,
    subtotalMinor,
    shippingMinor: SHIPPING_MINOR,
    totalMinor,
    currency: "INR",
  };
}

export async function createShopOrder({
  userId,
  items,
  shippingAddress,
  paymentMethod = "online",
}) {
  const cart = await resolveCartItems(items);
  const orderNumber = await generateBiodropsOrderNumber();
  const isCod = paymentMethod === "cod";

  const order = await BiodropsOrder.create({
    orderNumber,
    userId,
    items: cart.items.map(
      ({ productId, sku, name, quantity, unitPriceMinor, lineTotalMinor }) => ({
        productId,
        sku,
        name,
        quantity,
        unitPriceMinor,
        lineTotalMinor,
      }),
    ),
    shippingAddress,
    subtotalMinor: cart.subtotalMinor,
    shippingMinor: cart.shippingMinor,
    totalMinor: cart.totalMinor,
    currency: cart.currency,
    paymentMethod: isCod ? "cod" : "online",
    paymentStatus: "pending",
    fulfillmentStatus: isCod ? "confirmed" : "pending",
    notes: isCod ? "Cash on delivery" : "",
  });

  if (isCod) {
    await decrementStockForOrder(order);
    return { order, razorpayOrder: null, paymentMethod: "cod" };
  }

  const razorpayOrder = await createRazorpayProductOrder({
    amountMinor: cart.totalMinor,
    currency: cart.currency,
    receipt: orderNumber,
    notes: {
      biodropsOrderId: String(order._id),
      orderNumber,
      type: "biodrops_shop",
    },
  });

  order.razorpayOrderId = razorpayOrder.id;
  await order.save();

  return { order, razorpayOrder, paymentMethod: "online" };
}

export async function restoreStockForOrder(order) {
  for (const item of order.items || []) {
    const product = await BiodropsProduct.findById(item.productId);
    if (!product || product.stockQuantity == null) continue;
    product.stockQuantity += item.quantity;
    await product.save();
  }
}

export async function decrementStockForOrder(order) {
  for (const item of order.items || []) {
    const product = await BiodropsProduct.findById(item.productId);
    if (!product || product.stockQuantity == null) continue;
    product.stockQuantity = Math.max(0, product.stockQuantity - item.quantity);
    await product.save();
  }
}

export async function markShopOrderPaid({
  order,
  razorpayPaymentId,
  source = "verify",
}) {
  if (order.paymentStatus === "paid") {
    return { order, alreadyPaid: true };
  }

  order.paymentStatus = "paid";
  order.fulfillmentStatus =
    order.fulfillmentStatus === "cancelled" ? "confirmed" : "confirmed";
  order.razorpayPaymentId = razorpayPaymentId || order.razorpayPaymentId;
  order.paidAt = new Date();
  await order.save();
  await decrementStockForOrder(order);

  await logShopPaymentEvent({
    order,
    razorpayEventId: `shop_paid_${order._id}_${razorpayPaymentId || Date.now()}`,
    eventType: `shop.payment.${source}`,
    razorpayPaymentId: order.razorpayPaymentId,
    razorpayOrderId: order.razorpayOrderId,
    amountMinor: order.totalMinor,
    currency: order.currency,
    status: "captured",
  });

  return { order, alreadyPaid: false, source };
}

export async function cancelFarmerShopOrder({ userId, orderId, reason = "" }) {
  const order = await BiodropsOrder.findById(orderId);
  if (!order) {
    const err = new Error("Order not found");
    err.status = 404;
    throw err;
  }
  if (String(order.userId) !== String(userId)) {
    const err = new Error("Order not found");
    err.status = 404;
    throw err;
  }
  if (order.paymentStatus !== "pending") {
    const err = new Error("Only unpaid orders can be cancelled");
    err.status = 400;
    throw err;
  }
  if (!["pending", "confirmed"].includes(order.fulfillmentStatus)) {
    const err = new Error("Order cannot be cancelled at this stage");
    err.status = 400;
    throw err;
  }
  if (order.fulfillmentStatus === "cancelled") {
    const err = new Error("Order is already cancelled");
    err.status = 400;
    throw err;
  }

  const restoreStock = order.paymentMethod === "cod";

  order.fulfillmentStatus = "cancelled";
  order.cancelledAt = new Date();
  order.cancelledBy = userId;
  order.cancelReason = String(reason || "").trim();

  if (restoreStock) {
    await restoreStockForOrder(order);
  }

  await order.save();

  return order.toObject ? order.toObject() : order;
}

export async function retryShopOrderPayment({ userId, orderId }) {
  const order = await BiodropsOrder.findById(orderId);
  if (!order) {
    const err = new Error("Order not found");
    err.status = 404;
    throw err;
  }
  if (String(order.userId) !== String(userId)) {
    const err = new Error("Order not found");
    err.status = 404;
    throw err;
  }
  if (order.paymentMethod === "cod") {
    const err = new Error(
      "Online payment retry is not available for COD orders",
    );
    err.status = 400;
    throw err;
  }
  if (order.paymentStatus !== "pending") {
    const err = new Error("Payment retry is only for pending orders");
    err.status = 400;
    throw err;
  }
  if (order.fulfillmentStatus === "cancelled") {
    const err = new Error("Cancelled orders cannot be paid");
    err.status = 400;
    throw err;
  }

  const razorpayOrder = await createRazorpayProductOrder({
    amountMinor: order.totalMinor,
    currency: order.currency,
    receipt: order.orderNumber,
    notes: {
      biodropsOrderId: String(order._id),
      orderNumber: order.orderNumber,
      type: "biodrops_shop_retry",
    },
  });

  order.razorpayOrderId = razorpayOrder.id;
  await order.save();

  return { order, razorpayOrder };
}

export async function verifyAndFulfillShopOrder({
  userId,
  orderId,
  razorpayOrderId,
  razorpayPaymentId,
  razorpaySignature,
  clearServerCart = false,
}) {
  const order = await BiodropsOrder.findById(orderId);
  if (!order) {
    const err = new Error("Order not found");
    err.status = 404;
    throw err;
  }
  if (String(order.userId) !== String(userId)) {
    const err = new Error("Order not found");
    err.status = 404;
    throw err;
  }
  if (order.razorpayOrderId && razorpayOrderId && order.razorpayOrderId !== razorpayOrderId) {
    const err = new Error("Razorpay order mismatch");
    err.status = 400;
    throw err;
  }

  const valid = verifyRazorpayPaymentSignature({
    razorpayOrderId: razorpayOrderId || order.razorpayOrderId,
    razorpayPaymentId,
    razorpaySignature,
  });

  if (!valid) {
    const err = new Error("Invalid payment signature");
    err.status = 400;
    throw err;
  }

  const result = await markShopOrderPaid({
    order,
    razorpayPaymentId,
    source: "client_verify",
  });

  if (clearServerCart && !result.alreadyPaid) {
    await clearUserCart(userId);
  }

  return result;
}

export async function findShopOrderByRazorpayOrderId(razorpayOrderId) {
  if (!razorpayOrderId) return null;
  return BiodropsOrder.findOne({ razorpayOrderId });
}
