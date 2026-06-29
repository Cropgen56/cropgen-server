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
} from "../controllers/shop/index.js";

const router = express.Router();

router.use(forceBiodropsBrand);

router.get("/products", listShopProducts);
router.get("/products/:sku", getShopProductBySku);

router.post("/checkout/create-order", requireAuth, createShopCheckoutOrder);
router.post("/checkout/verify", requireAuth, verifyShopCheckout);
router.get("/orders", requireAuth, listFarmerOrders);
router.get("/orders/:id", requireAuth, getFarmerOrderById);

export default router;
