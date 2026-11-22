import express from "express";
import {
  getFarmerCarbonProfileHandler,
  getFieldCarbonHistoryHandler,
  getAdminFarmsHandler,
  getAdminFarmersHandler,
  getAdminOrganizationsHandler,
  getPlatformTotalHandler,
} from "../controllers/carbon/carbon.controller.js";

import {
  isAuthenticated,
  authorizeAdminOrOrgScoped,
} from "../middleware/auth.middleware.js";

const router = express.Router();

// Carbon data is read only by the admin panel: require a login and an
// admin-panel role (admin, developer, client, or AAT staff) on every route.
router.use(isAuthenticated, authorizeAdminOrOrgScoped);

router.get("/profile/:userId", getFarmerCarbonProfileHandler);
router.get("/field/:farmFieldId/history", getFieldCarbonHistoryHandler);

router.get("/admin/farms", getAdminFarmsHandler);
router.get("/admin/farmers", getAdminFarmersHandler);
router.get("/admin/organizations", getAdminOrganizationsHandler);
router.get("/admin/platform-total", getPlatformTotalHandler);

export default router;
