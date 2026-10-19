import express from "express";
import {
  addField,
  deleteField,
  getField,
  updateField,
  getAllField,
  requestFieldMonitoring,
  getMonitoringRequests,
} from "../controllers/field/field.controller.js";
import {
  addCropToField,
  getCropsForField,
  updateCropForField,
  deleteCropForField,
} from "../controllers/field-crop/field-crop.controller.js";
import { isAuthenticated } from "../middleware/auth.middleware.js";
const router = express.Router();

// Define the routes
router.post("/add-field/:userId", isAuthenticated, addField);
router.get("/get-field/:userId", isAuthenticated, getField);
router.get("/get-all-field", isAuthenticated, getAllField);
router.delete("/delete-field/:fieldId", isAuthenticated, deleteField);
router.patch("/update-field/:fieldId", isAuthenticated, updateField);
router.post("/request-monitoring/:userId", isAuthenticated, requestFieldMonitoring);
router.get("/monitoring-requests/:userId", isAuthenticated, getMonitoringRequests);

// Multi-crop: additional crops on a farm, beyond the default single-crop one.
router.post("/:fieldId/crops", isAuthenticated, addCropToField);
router.get("/:fieldId/crops", isAuthenticated, getCropsForField);
router.patch("/:fieldId/crops/:cropId", isAuthenticated, updateCropForField);
router.delete("/:fieldId/crops/:cropId", isAuthenticated, deleteCropForField);

export default router;
