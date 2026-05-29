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
import { isAuthenticated } from "../../../middleware/auth.middleware.js";

const router = express.Router();

router.post("/internal/generate-advisory", generateFarmAdvisory);
router.patch(
  "/:advisoryId/activities/:activityType/progress",
  isAuthenticated,
  patchAdvisoryActivityProgress,
);
router.get("/:farmFieldId/npk-breakdown", isAuthenticated, getLatestNpkBreakdown);
router.get("/", getAllFarmAdvisories);
router.get("/farmers", getFarmersWithAdvisories);
router.get("/by-id/:advisoryId", getAdvisoryById);
router.get("/user/:userId", getFarmAdvisoriesByUser);
router.get("/:farmFieldId", getFarmAdvisories);

export default router;
