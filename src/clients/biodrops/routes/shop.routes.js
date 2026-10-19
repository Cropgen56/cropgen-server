import express from "express";
import { requireAuth } from "../../../middleware/auth.middleware.js";
import { forceBiodropsBrand } from "../middleware/forceBrand.middleware.js";
import {
  listShopProducts,
  getShopProductBySku,
  createShopCheckoutOrder,
  verifyShopCheckout,
  listFarmerOrders,
  getFarmerOrderById,
  cancelFarmerOrder,
  retryFarmerOrderPayment,
  getFarmerOrderInvoice,
  getShopCart,
  replaceShopCart,
  addShopCartItem,
  patchShopCartItem,
  deleteShopCartItem,
  clearShopCart,
  listShopAddresses,
  createShopAddress,
  updateShopAddress,
  deleteShopAddress,
  setDefaultShopAddress,
} from "../controllers/shop/index.js";

const router = express.Router();

router.use(forceBiodropsBrand);

router.get("/products", listShopProducts);
router.get("/products/:sku", getShopProductBySku);

router.get("/cart", requireAuth, getShopCart);
router.put("/cart", requireAuth, replaceShopCart);
router.delete("/cart", requireAuth, clearShopCart);
router.post("/cart/items", requireAuth, addShopCartItem);
router.patch("/cart/items/:sku", requireAuth, patchShopCartItem);
router.delete("/cart/items/:sku", requireAuth, deleteShopCartItem);

router.get("/addresses", requireAuth, listShopAddresses);
router.post("/addresses", requireAuth, createShopAddress);
router.patch("/addresses/:id", requireAuth, updateShopAddress);
router.delete("/addresses/:id", requireAuth, deleteShopAddress);
router.post("/addresses/:id/default", requireAuth, setDefaultShopAddress);

router.post("/checkout/create-order", requireAuth, createShopCheckoutOrder);
router.post("/checkout/verify", requireAuth, verifyShopCheckout);
router.get("/orders", requireAuth, listFarmerOrders);
router.get("/orders/:id", requireAuth, getFarmerOrderById);
router.post("/orders/:id/cancel", requireAuth, cancelFarmerOrder);
router.post("/orders/:id/retry-payment", requireAuth, retryFarmerOrderPayment);
router.get("/orders/:id/invoice", requireAuth, getFarmerOrderInvoice);

export default router;
