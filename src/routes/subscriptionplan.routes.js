import express from "express";
import {
  createSubscriptionPlan,
  getAllSubscriptionPlans,
  getSubscriptionPlanById,
  updateSubscriptionPlan,
  deleteSubscriptionPlan,
} from "../controllers/subscriptionplancontroller/index.js";
import {
  isAuthenticated,
  authorizeRoles,
} from "../middleware/authMiddleware.js";

const router = express.Router();

router.post(
  "/",
  isAuthenticated,
  authorizeRoles("admin"),
  createSubscriptionPlan,
);
router.get("/", isAuthenticated, getAllSubscriptionPlans);
router.get("/:id", isAuthenticated, getSubscriptionPlanById);
router.patch(
  "/:id",
  isAuthenticated,
  authorizeRoles("admin"),
  updateSubscriptionPlan,
);

router.delete(
  "/:id",
  isAuthenticated,
  authorizeRoles("admin"),
  deleteSubscriptionPlan,
);

export default router;
