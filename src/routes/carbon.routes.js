import express from "express";
import {
  getFarmerCarbonProfileHandler,
  getFieldCarbonHistoryHandler,
  getAdminFarmsHandler,
  getAdminFarmersHandler,
  getAdminOrganizationsHandler,
  getPlatformTotalHandler,
} from "../controllers/carbon/carbon.controller.js";

const router = express.Router();

router.get("/profile/:userId", getFarmerCarbonProfileHandler);
router.get("/field/:farmFieldId/history", getFieldCarbonHistoryHandler);

router.get("/admin/farms", getAdminFarmsHandler);
router.get("/admin/farmers", getAdminFarmersHandler);
router.get("/admin/organizations", getAdminOrganizationsHandler);
router.get("/admin/platform-total", getPlatformTotalHandler);

export default router;
