import express from "express";
import {
  getFarmAdvisories,
  generateFarmAdvisory,
  getFarmAdvisoriesByUser,
  getAllFarmAdvisories,
} from "../controllers/advisory.controller.js";
import { isAuthenticated } from "../../../middleware/auth.middleware.js";

const router = express.Router();

router.post("/internal/generate-advisory", isAuthenticated, generateFarmAdvisory);
router.get("/", getAllFarmAdvisories);
router.get("/user/:userId", getFarmAdvisoriesByUser);
router.get("/:farmFieldId", getFarmAdvisories);

export default router;
