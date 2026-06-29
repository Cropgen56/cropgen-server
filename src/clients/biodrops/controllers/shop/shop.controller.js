import BiodropsProduct from "../../models/biodrops-product.model.js";
import BiodropsOrder from "../../models/biodrops-order.model.js";
import User from "../../../../models/user.model.js";
import { formatBiodropsProduct } from "../../utils/formatProduct.js";
import { formatBiodropsOrder } from "../../utils/formatOrder.js";
import {
  createShopOrder,
  verifyAndFulfillShopOrder,
} from "../../services/shopCheckout.service.js";
import { getRazorpayKeyId } from "../../../../services/razorpay.order.service.js";
import { isBiodropsUser } from "../../../../utils/organization/biodropsOrganization.js";

function normalizeSku(sku) {
  return String(sku || "")
    .trim()
    .toLowerCase();
}

export const listShopProducts = async (req, res) => {
  try {
    const products = await BiodropsProduct.find({ status: "active" })
      .sort({ sortOrder: 1, name: 1 })
      .lean();

    return res.status(200).json({
      success: true,
      products: products.map(formatBiodropsProduct),
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

async function assertBiodropsFarmer(req) {
  const userId = req.auth?.id || req.auth?._id || req.user?.id || req.user?._id;
  if (!userId) {
    const err = new Error("Unauthorized");
    err.status = 401;
    throw err;
  }

  const user = await User.findById(userId)
    .populate("organization", "organizationCode code")
    .lean();

  if (!user || !isBiodropsUser(user)) {
    const err = new Error("Biodrops account required");
    err.status = 403;
    throw err;
  }

  return { userId, user };
}

function validateShippingAddress(addr = {}) {
  const required = ["name", "phone", "line1", "city", "state", "pincode"];
  for (const key of required) {
    if (!String(addr[key] || "").trim()) {
      const err = new Error(`shippingAddress.${key} is required`);
      err.status = 400;
      throw err;
    }
  }
  return {
    name: String(addr.name).trim(),
    phone: String(addr.phone).trim(),
    line1: String(addr.line1).trim(),
    line2: String(addr.line2 || "").trim(),
    city: String(addr.city).trim(),
    state: String(addr.state).trim(),
    pincode: String(addr.pincode).trim(),
    country: String(addr.country || "IN").trim(),
  };
}

export const createShopCheckoutOrder = async (req, res) => {
  try {
    const { userId } = await assertBiodropsFarmer(req);
    const { items, shippingAddress } = req.body;

    const shipping = validateShippingAddress(shippingAddress);
    const { order, razorpayOrder } = await createShopOrder({
      userId,
      items,
      shippingAddress: shipping,
    });

    return res.status(201).json({
      success: true,
      orderId: String(order._id),
      orderNumber: order.orderNumber,
      razorpayOrderId: razorpayOrder.id,
      razorpayKeyId: getRazorpayKeyId(),
      amount: order.totalMinor,
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
