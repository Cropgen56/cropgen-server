import express from "express";
import {
  createSubscriptionOrder,
  verifySubscriptionOrder,
  getUserSubscriptions,
  getUserSubscriptionById,
  updateUserSubscription,
  deleteUserSubscription,
  activateSubscriptionManually,
  demoActivateAllSubscriptions,
  getSubscriptionAdminDetail,
  cancelSubscriptionAdmin,
} from "../controllers/subscription/index.js";

import { isAuthenticated, authorizeAdminOrOrgScoped } from "../middleware/auth.middleware.js";

const router = express.Router();

// rezorpay routes
router.post("/create-order", isAuthenticated, createSubscriptionOrder);
router.post("/verify-order", isAuthenticated, verifySubscriptionOrder);
router.post(
  "/active-subscription",
  isAuthenticated,
  authorizeAdminOrOrgScoped,
  activateSubscriptionManually,
);
router.post(
  "/demo-activate-all",
  isAuthenticated,
  demoActivateAllSubscriptions,
);

// crud apis
router.get("/", isAuthenticated, authorizeAdminOrOrgScoped, getUserSubscriptions);
router.get(
  "/admin/:id/detail",
  isAuthenticated,
  authorizeAdminOrOrgScoped,
  getSubscriptionAdminDetail,
);
router.post(
  "/admin/:id/cancel",
  isAuthenticated,
  authorizeAdminOrOrgScoped,
  cancelSubscriptionAdmin,
);
router.get("/:id", isAuthenticated, authorizeAdminOrOrgScoped, getUserSubscriptionById);
router.patch("/:id", isAuthenticated, authorizeAdminOrOrgScoped, updateUserSubscription);
router.delete("/:id", isAuthenticated, authorizeAdminOrOrgScoped, deleteUserSubscription);

export default router;
