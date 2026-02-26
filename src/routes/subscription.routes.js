import express from "express";
import {
  createSubscriptionOrder,
  verifySubscriptionOrder,
  getUserSubscriptions,
  getUserSubscriptionById,
  updateUserSubscription,
  deleteUserSubscription,
  activateSubscriptionManually,
} from "../controllers/subscriptioncontroller/index.js";

import { isAuthenticated } from "../middleware/authMiddleware.js";

const router = express.Router();

// rezorpay routes
router.post("/create-order", isAuthenticated, createSubscriptionOrder);
router.post("/verify-order", isAuthenticated, verifySubscriptionOrder);
router.post(
  "/active-subscription",
  isAuthenticated,
  activateSubscriptionManually,
);

// crud apis
router.get("/", getUserSubscriptions);
router.get("/:id", getUserSubscriptionById);
router.patch("/:id", updateUserSubscription);
router.delete("/:id", deleteUserSubscription);

export default router;
