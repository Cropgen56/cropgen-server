import express from "express";
import { createSoilHealthReport } from "./soilHealth.controller.js";

const router = express.Router();

router.post("/report", createSoilHealthReport);

export default router;
