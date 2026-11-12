import express from "express";
import { createSoilHealthReport } from "./soilHealth.controller.js";

import { optionalAuthenticate } from "../../middleware/auth.middleware.js";
import { requireBodyFieldPlanFeature } from "../../middleware/planFeature.middleware.js";

const router = express.Router();

// Token + fieldId (sent by the web and mobile apps) are checked against the
// field's plan. Set SOIL_REPORT_REQUIRE_FIELD=true once updated apps are live
// to make fieldId mandatory.
router.post(
  "/report",
  optionalAuthenticate,
  requireBodyFieldPlanFeature("soilReportGeneration", {
    requireEnv: "SOIL_REPORT_REQUIRE_FIELD",
  }),
  createSoilHealthReport,
);

export default router;
