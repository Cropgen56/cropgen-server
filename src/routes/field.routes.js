import express from "express";
import {
  addField,
  deleteField,
  getField,
  updateField,
  getAllField,
  requestFieldMonitoring,
  getMonitoringRequests,
} from "../controllers/field.controller.js";
import { isAuthenticated } from "../middleware/auth.middleware.js";
const router = express.Router();

// Define the routes
router.post("/add-field/:userId", isAuthenticated, addField);
router.get("/get-field/:userId", getField);
router.get("/get-all-field", isAuthenticated, getAllField);
router.delete("/delete-field/:fieldId", isAuthenticated, deleteField);
router.patch("/update-field/:fieldId", isAuthenticated, updateField);
router.post("/request-monitoring/:userId", isAuthenticated, requestFieldMonitoring);
router.get("/monitoring-requests/:userId", isAuthenticated, getMonitoringRequests);

export default router;
