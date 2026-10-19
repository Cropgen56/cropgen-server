import express from "express";
import {
  createSubscriptionPlan,
  getAllSubscriptionPlans,
  getSubscriptionPlanById,
  updateSubscriptionPlan,
  deleteSubscriptionPlan,
} from "../controllers/subscription-plan/index.js";
import {
  isAuthenticated,
  optionalAuthenticate,
  authorizeAdminOrOrgScoped,
} from "../middleware/auth.middleware.js";

const router = express.Router();

router.post(
  "/",
  isAuthenticated,
  authorizeAdminOrOrgScoped,
  createSubscriptionPlan,
);
router.get("/", optionalAuthenticate, getAllSubscriptionPlans);
router.get("/:id", isAuthenticated, getSubscriptionPlanById);
router.patch(
  "/:id",
  isAuthenticated,
  authorizeAdminOrOrgScoped,
  updateSubscriptionPlan,
);

router.delete(
  "/:id",
  isAuthenticated,
  authorizeAdminOrOrgScoped,
  deleteSubscriptionPlan,
);

export default router;
