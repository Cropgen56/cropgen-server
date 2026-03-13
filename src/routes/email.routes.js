import express from "express";
import {
  createCampaign,
  listCampaigns,
  startCampaign,
  getCampaignStatus,
  getCampaignSegmentStats,
  listCampaignFailures,
  retryCampaignFailures,
  updateCampaign,
  stopCampaign,
  deleteCampaign,
  testCampaign,
  getCampaignDetails,
} from "../controllers/email.campaign.controller.js";
import {
  isAuthenticated,
  authorizeRoles,
} from "../middleware/auth.middleware.js";

const router = express.Router();

router.post(
  "/campaign",
  isAuthenticated,
  authorizeRoles("admin"),
  createCampaign,
);
router.get(
  "/campaigns",
  isAuthenticated,
  authorizeRoles("admin"),
  listCampaigns,
);

router.get(
  "/campaign/:campaignId/segment-stats",
  isAuthenticated,
  authorizeRoles("admin"),
  getCampaignSegmentStats,
);
router.post(
  "/campaign/:campaignId/test",
  isAuthenticated,
  authorizeRoles("admin"),
  testCampaign,
);
router.post(
  "/campaign/:campaignId/start",
  isAuthenticated,
  authorizeRoles("admin"),
  startCampaign,
);
router.get(
  "/campaign/:campaignId",
  isAuthenticated,
  authorizeRoles("admin"),
  getCampaignStatus,
);

router.get(
  "/campaign/:campaignId/failures",
  isAuthenticated,
  authorizeRoles("admin"),
  listCampaignFailures,
);
router.post(
  "/campaign/:campaignId/retry-failures",
  isAuthenticated,
  authorizeRoles("admin"),
  retryCampaignFailures,
);

router.get(
  "/campaign-details/:campaignId",
  isAuthenticated,
  authorizeRoles("admin"),
  getCampaignDetails,
);
router.patch(
  "/campaign/:campaignId",
  isAuthenticated,
  authorizeRoles("admin"),
  updateCampaign,
);
router.delete(
  "/campaign/:campaignId",
  isAuthenticated,
  authorizeRoles("admin"),
  deleteCampaign,
);
router.post(
  "/campaign/:campaignId/stop",
  isAuthenticated,
  authorizeRoles("admin"),
  stopCampaign,
);

export default router;
