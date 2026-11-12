import express from "express";
import {
  addOperation,
  getOperationsByFarmField,
  getOperationById,
  updateOperation,
  deleteOperation,
} from "../controllers/operation/operation.controller.js";

import { isAuthenticated } from "../middleware/auth.middleware.js";

import {
  requirePlanFeature,
  requireOperationPlanFeature,
} from "../middleware/planFeature.middleware.js";

const FEATURE = "farmOperationsManagement";

const router = express.Router();

// Define the routes
router.post("/:farmFieldId/create", isAuthenticated, requirePlanFeature(FEATURE), addOperation);
router.get("/:farmFieldId/get", isAuthenticated, requirePlanFeature(FEATURE), getOperationsByFarmField);
router.get("/:operationId", isAuthenticated, requireOperationPlanFeature(FEATURE), getOperationById);
router.put("/:operationId", isAuthenticated, requireOperationPlanFeature(FEATURE), updateOperation);
router.delete("/:operationId", isAuthenticated, requireOperationPlanFeature(FEATURE), deleteOperation);

export default router;
