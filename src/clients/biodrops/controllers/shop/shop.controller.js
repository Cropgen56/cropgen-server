import BiodropsProduct from "../../models/biodrops-product.model.js";
import BiodropsOrder from "../../models/biodrops-order.model.js";
import { formatBiodropsProduct } from "../../utils/formatProduct.js";
import { formatBiodropsOrder } from "../../utils/formatOrder.js";
import {
  createShopOrder,
  verifyAndFulfillShopOrder,
  retryShopOrderPayment,
  cancelFarmerShopOrder,
} from "../../services/shopCheckout.service.js";
import { getCartItemsForCheckout, clearUserCart } from "../../services/shopCart.service.js";
import { getRazorpayKeyId } from "../../../../services/razorpay.order.service.js";
import {
  assertBiodropsFarmer,
  validateShippingAddress,
} from "../../utils/shopAuth.util.js";
import { buildShopInvoiceHtml } from "../../utils/shopInvoice.util.js";

function normalizeSku(sku) {
  return String(sku || "")
    .trim()
    .toLowerCase();
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export const listShopProducts = async (req, res) => {
  try {
    const { category, search, page = 1, limit = 50 } = req.query;
    const parsedLimit = Math.max(1, Math.min(100, parseInt(limit, 10) || 50));
    const parsedPage = Math.max(1, parseInt(page, 10) || 1);
    const skip = (parsedPage - 1) * parsedLimit;

    const query = { status: "active" };

    if (category && String(category).trim() && category !== "all") {
      query.category = String(category).trim().toLowerCase();
    }

    if (search && String(search).trim()) {
      const term = escapeRegex(String(search).trim());
      query.$or = [
        { name: { $regex: term, $options: "i" } },
        { sku: { $regex: term, $options: "i" } },
        { description: { $regex: term, $options: "i" } },
      ];
    }

    const [products, total] = await Promise.all([
      BiodropsProduct.find(query)
        .sort({ sortOrder: 1, name: 1 })
        .skip(skip)
        .limit(parsedLimit)
        .lean(),
      BiodropsProduct.countDocuments(query),
    ]);

    return res.status(200).json({
      success: true,
      products: products.map(formatBiodropsProduct),
      pagination: {
        page: parsedPage,
        currentPage: parsedPage,
        totalPages: Math.max(1, Math.ceil(total / parsedLimit)),
        total,
        limit: parsedLimit,
      },
    });
  } catch (error) {
    console.error("listShopProducts:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to load products.",
    });
  }
};

export const getShopProductBySku = async (req, res) => {
  try {
    const sku = normalizeSku(req.params.sku);
    const product = await BiodropsProduct.findOne({
      sku,
      status: "active",
    }).lean();

    if (!product) {
      return res.status(404).json({ success: false, message: "Product not found" });
    }

    return res.status(200).json({
      success: true,
      product: formatBiodropsProduct(product),
    });
  } catch (error) {
    console.error("getShopProductBySku:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to load product.",
    });
  }
};

export const createShopCheckoutOrder = async (req, res) => {
  try {
    const { userId } = await assertBiodropsFarmer(req);
    const { items, shippingAddress, useServerCart, paymentMethod } = req.body;

    const shipping = validateShippingAddress(shippingAddress);
    const method = paymentMethod === "cod" ? "cod" : "online";
    let checkoutItems = items;

    if (useServerCart) {
      const serverItems = await getCartItemsForCheckout(userId);
      checkoutItems =
        serverItems?.length > 0
          ? serverItems
          : Array.isArray(items) && items.length
            ? items
            : serverItems;
    }

    const { order, razorpayOrder, paymentMethod: resolvedMethod } =
      await createShopOrder({
        userId,
        items: checkoutItems,
        shippingAddress: shipping,
        paymentMethod: method,
      });

    if (resolvedMethod === "cod") {
      if (useServerCart) {
        await clearUserCart(userId);
      }

      return res.status(201).json({
        success: true,
        paymentMethod: "cod",
        requiresOnlinePayment: false,
        orderId: String(order._id),
        orderNumber: order.orderNumber,
        amount: order.totalMinor,
        currency: order.currency,
        order: formatBiodropsOrder(order),
      });
    }

    return res.status(201).json({
      success: true,
      paymentMethod: "online",
      requiresOnlinePayment: true,
      orderId: String(order._id),
      orderNumber: order.orderNumber,
      razorpayOrderId: razorpayOrder.id,
      razorpayKeyId: getRazorpayKeyId(),
      amount: Number(razorpayOrder.amount ?? order.totalMinor),
      currency: order.currency,
      order: formatBiodropsOrder(order),
    });
  } catch (error) {
    const status = error.status || 500;
    if (status >= 500) console.error("createShopCheckoutOrder:", error);
    return res.status(status).json({
      success: false,
      message: error.message || "Failed to create order.",
    });
  }
};

export const verifyShopCheckout = async (req, res) => {
  try {
    const { userId } = await assertBiodropsFarmer(req);
    const {
      orderId,
      razorpay_order_id,
      razorpayOrderId,
      razorpay_payment_id,
      razorpayPaymentId,
      razorpay_signature,
      razorpaySignature,
      useServerCart,
    } = req.body;

    if (!orderId) {
      return res.status(400).json({
        success: false,
        message: "orderId is required",
      });
    }

    const result = await verifyAndFulfillShopOrder({
      userId,
      orderId,
      razorpayOrderId: razorpay_order_id || razorpayOrderId,
      razorpayPaymentId: razorpay_payment_id || razorpayPaymentId,
      razorpaySignature: razorpay_signature || razorpaySignature,
      clearServerCart: !!useServerCart,
    });

    return res.status(200).json({
      success: true,
      alreadyPaid: result.alreadyPaid,
      order: formatBiodropsOrder(result.order),
    });
  } catch (error) {
    const status = error.status || 500;
    if (status >= 500) console.error("verifyShopCheckout:", error);
    return res.status(status).json({
      success: false,
      message: error.message || "Payment verification failed.",
    });
  }
};

export const listFarmerOrders = async (req, res) => {
  try {
    const { userId } = await assertBiodropsFarmer(req);
    const { page = 1, limit = 20 } = req.query;
    const parsedLimit = Math.max(1, Math.min(50, parseInt(limit, 10) || 20));
    const parsedPage = Math.max(1, parseInt(page, 10) || 1);
    const skip = (parsedPage - 1) * parsedLimit;

    const query = { userId };
    const [orders, total] = await Promise.all([
      BiodropsOrder.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parsedLimit)
        .lean(),
      BiodropsOrder.countDocuments(query),
    ]);

    return res.status(200).json({
      success: true,
      orders: orders.map(formatBiodropsOrder),
      pagination: {
        page: parsedPage,
        currentPage: parsedPage,
        totalPages: Math.max(1, Math.ceil(total / parsedLimit)),
        total,
        limit: parsedLimit,
      },
    });
  } catch (error) {
    const status = error.status || 500;
    if (status >= 500) console.error("listFarmerOrders:", error);
    return res.status(status).json({
      success: false,
      message: error.message || "Failed to load orders.",
    });
  }
};

export const getFarmerOrderById = async (req, res) => {
  try {
    const { userId } = await assertBiodropsFarmer(req);
    const order = await BiodropsOrder.findOne({
      _id: req.params.id,
      userId,
    }).lean();

    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    return res.status(200).json({
      success: true,
      order: formatBiodropsOrder(order),
    });
  } catch (error) {
    const status = error.status || 500;
    if (status >= 500) console.error("getFarmerOrderById:", error);
    return res.status(status).json({
      success: false,
      message: error.message || "Failed to load order.",
    });
  }
};

export const cancelFarmerOrder = async (req, res) => {
  try {
    const { userId } = await assertBiodropsFarmer(req);
    const order = await cancelFarmerShopOrder({
      userId,
      orderId: req.params.id,
      reason: req.body?.reason,
    });

    return res.status(200).json({
      success: true,
      order: formatBiodropsOrder(order),
    });
  } catch (error) {
    const status = error.status || 500;
    if (status >= 500) console.error("cancelFarmerOrder:", error);
    return res.status(status).json({
      success: false,
      message: error.message || "Failed to cancel order.",
    });
  }
};

export const retryFarmerOrderPayment = async (req, res) => {
  try {
    const { userId } = await assertBiodropsFarmer(req);
    const { order, razorpayOrder } = await retryShopOrderPayment({
      userId,
      orderId: req.params.id,
    });

    return res.status(200).json({
      success: true,
      orderId: String(order._id),
      orderNumber: order.orderNumber,
      razorpayOrderId: razorpayOrder.id,
      razorpayKeyId: getRazorpayKeyId(),
      amount: Number(razorpayOrder.amount ?? order.totalMinor),
      currency: order.currency,
      order: formatBiodropsOrder(order),
    });
  } catch (error) {
    const status = error.status || 500;
    if (status >= 500) console.error("retryFarmerOrderPayment:", error);
    return res.status(status).json({
      success: false,
      message: error.message || "Failed to retry payment.",
    });
  }
};

export const getFarmerOrderInvoice = async (req, res) => {
  try {
    const { userId } = await assertBiodropsFarmer(req);
    const order = await BiodropsOrder.findOne({
      _id: req.params.id,
      userId,
    })
      .populate("userId", "firstName lastName phone email")
      .lean();

    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    if (!["paid", "refunded"].includes(order.paymentStatus)) {
      return res.status(400).json({
        success: false,
        message: "Invoice available only for paid orders",
      });
    }

    const formatted = formatBiodropsOrder(order, { includeUser: true });
    const wantsHtml =
      req.query.format === "html" ||
      String(req.headers.accept || "").includes("text/html");

    if (wantsHtml) {
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
      htmlUrl: `${req.baseUrl}/orders/${req.params.id}/invoice?format=html`,
    });
  } catch (error) {
    console.error("getFarmerOrderInvoice:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to generate invoice",
    });
  }
};
