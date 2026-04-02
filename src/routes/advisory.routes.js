import express from "express";
import {
  getFarmAdvisories,
  generateFarmAdvisory,
  getFarmAdvisoriesByUser,
  getAllFarmAdvisories,
} from "../controllers/advisory.controller.js";

const router = express.Router();

router.post("/internal/generate-advisory", generateFarmAdvisory);
router.get("/", getAllFarmAdvisories);
router.get("/user/:userId", getFarmAdvisoriesByUser);
router.get("/:farmFieldId", getFarmAdvisories);

export default router;
