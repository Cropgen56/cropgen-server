import express from "express";
import {
  getFarmAdvisories,
  getLatestNpkBreakdown,
  generateFarmAdvisory,
  getFarmAdvisoriesByUser,
  getAllFarmAdvisories,
  getAdvisoryById,
  getFarmersWithAdvisories,
  patchAdvisoryActivityProgress,
} from "../controllers/advisory.controller.js";
import {
  getFieldEvents,
  getMyEvents,
  updateFieldEvent,
  getFieldCondition,
  triggerConditionMonitor,
} from "../controllers/fieldEvents.controller.js";
import {
  checkApiKey,
  isAuthenticated,
} from "../../../middleware/auth.middleware.js";

const router = express.Router();

router.post("/internal/generate-advisory", checkApiKey, generateFarmAdvisory);
// Crop condition monitor (real-time events / popups). Registered before the
// "/:farmFieldId" catch-all.
router.post("/internal/monitor", checkApiKey, triggerConditionMonitor);
router.get("/events/user/me", isAuthenticated, getMyEvents);
router.patch("/events/item/:eventId", isAuthenticated, updateFieldEvent);
router.get("/events/:farmFieldId", isAuthenticated, getFieldEvents);
router.get("/condition/:farmFieldId", isAuthenticated, getFieldCondition);
router.patch(
  "/:advisoryId/activities/:activityType/progress",
  isAuthenticated,
  patchAdvisoryActivityProgress,
);
router.get("/:farmFieldId/npk-breakdown", isAuthenticated, getLatestNpkBreakdown);
router.get("/", isAuthenticated, getAllFarmAdvisories);
router.get("/farmers", isAuthenticated, getFarmersWithAdvisories);
router.get("/by-id/:advisoryId", isAuthenticated, getAdvisoryById);
router.get("/user/:userId", isAuthenticated, getFarmAdvisoriesByUser);
router.get("/:farmFieldId", isAuthenticated, getFarmAdvisories);

export default router;
