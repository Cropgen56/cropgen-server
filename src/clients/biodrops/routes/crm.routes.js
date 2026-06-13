import express from "express";
import { isAuthenticated } from "../../../middleware/auth.middleware.js";
import { updateUserActivity } from "../../../middleware/update.user.activity.middleware.js";
import {
  attachBiodropsAdminActor,
  requireBiodropsAdminAccess,
} from "../middleware/admin.middleware.js";
import { listBiodropsUsers } from "../controllers/users/list.users.controller.js";
import {
  getUserManagementStats,
  listUserManagement,
  getUserManagementById,
  updateCrmUser,
  deleteCrmUser,
  listCrmAdminsForPicker,
  listPendingCrmInvitations,
  getHierarchyCapabilities,
} from "../controllers/user-management/index.js";
import { suspendBiodropsAdminAssignment } from "../controllers/admin-assignment/suspend.admin-assignment.controller.js";
import { createCrmInvitation } from "../controllers/invitations/create.invitation.controller.js";
import { checkCrmAssignmentAvailability } from "../controllers/invitations/check.assignment-availability.controller.js";
import { checkCrmInviteUser } from "../controllers/invitations/check.invite-user.controller.js";
import { getCrmInvitationByToken } from "../controllers/invitations/get-by-token.controller.js";
import { acceptCrmInvitation } from "../controllers/invitations/accept.invitation.controller.js";
import { resendCrmInvitation } from "../controllers/invitations/resend.invitation.controller.js";
import {
  listBiodropsFarmers,
  getBiodropsFarmerStats,
  getBiodropsFarmerById,
} from "../controllers/farmers/index.js";
import {
  generateAccessCards,
  listAccessCards,
  getAccessCardById,
  getAccessCardEvents,
} from "../controllers/access-cards/crm-generate.controller.js";
import { listCrmFarmerAccessCards } from "../controllers/access-cards/list-crm-farmer-cards.controller.js";
import {
  createSubscriptionPlan,
  getAllSubscriptionPlans,
  getSubscriptionPlanById,
  updateSubscriptionPlan,
  deleteSubscriptionPlan,
} from "../../../controllers/subscription-plan/index.js";
import {
  listCrmSubscriptions,
  listCrmFarmerSubscriptions,
  activateCrmFarmerSubscription,
  cancelCrmSubscription,
  approveCrmCardRemainder,
} from "../controllers/subscriptions/index.js";
import {
  forceBiodropsPlanBrand,
  ensureBiodropsPlanParam,
} from "../middleware/subscriptionPlan.middleware.js";
import { listCrmFarmerAdvisories } from "../controllers/advisories/index.js";

const router = express.Router();

/** Public — invitee email verification (no auth). */
router.get("/invitations/accept/:token", getCrmInvitationByToken);
router.post("/invitations/accept/:token", acceptCrmInvitation);
router.post("/invitations/accept", acceptCrmInvitation);

const crmGuards = [
  isAuthenticated,
  updateUserActivity,
  attachBiodropsAdminActor,
  requireBiodropsAdminAccess({
    minLevel: "ground",
    roles: ["admin", "developer", "staff"],
  }),
];

router.get("/user-management/stats", ...crmGuards, getUserManagementStats);
router.get(
  "/user-management/hierarchy",
  ...crmGuards,
  getHierarchyCapabilities,
);
router.get("/user-management/admins", ...crmGuards, listCrmAdminsForPicker);
router.get("/user-management/pending", ...crmGuards, listPendingCrmInvitations);
router.get("/user-management", ...crmGuards, listUserManagement);
router.get("/user-management/:id", ...crmGuards, getUserManagementById);
router.patch("/user-management/:id", ...crmGuards, updateCrmUser);
router.delete("/user-management/:id", ...crmGuards, deleteCrmUser);

router.patch(
  "/user-management/assignments/:id/suspend",
  ...crmGuards,
  suspendBiodropsAdminAssignment,
);

router.get(
  "/invitations/check-availability",
  ...crmGuards,
  checkCrmAssignmentAvailability,
);
router.get("/invitations/check-user", ...crmGuards, checkCrmInviteUser);
router.post("/invitations", ...crmGuards, createCrmInvitation);
router.post(
  "/invitations/resend/:userId",
  ...crmGuards,
  resendCrmInvitation,
);

router.get("/users", ...crmGuards, listBiodropsUsers);

router.get("/farmers/stats", ...crmGuards, getBiodropsFarmerStats);
router.get("/farmers/:id", ...crmGuards, getBiodropsFarmerById);
router.get("/farmers", ...crmGuards, listBiodropsFarmers);

router.post("/access-cards/generate", ...crmGuards, generateAccessCards);
router.get("/access-cards", ...crmGuards, listAccessCards);
router.get("/access-cards/:id/events", ...crmGuards, getAccessCardEvents);
router.get("/access-cards/:id", ...crmGuards, getAccessCardById);

router.get("/subscriptions", ...crmGuards, listCrmSubscriptions);
router.post(
  "/subscriptions/:id/cancel",
  ...crmGuards,
  cancelCrmSubscription,
);
router.post(
  "/subscriptions/:id/approve-card-remainder",
  ...crmGuards,
  approveCrmCardRemainder,
);

router.get(
  "/farmers/:id/access-cards",
  ...crmGuards,
  listCrmFarmerAccessCards,
);

router.get(
  "/farmers/:id/subscriptions",
  ...crmGuards,
  listCrmFarmerSubscriptions,
);
router.post(
  "/farmers/:id/subscriptions/activate",
  ...crmGuards,
  activateCrmFarmerSubscription,
);

router.get(
  "/farmers/:id/advisories",
  ...crmGuards,
  listCrmFarmerAdvisories,
);

router.get("/subscription-plans", ...crmGuards, getAllSubscriptionPlans);
router.post(
  "/subscription-plans",
  ...crmGuards,
  forceBiodropsPlanBrand,
  createSubscriptionPlan,
);
router.get(
  "/subscription-plans/:id",
  ...crmGuards,
  ensureBiodropsPlanParam,
  getSubscriptionPlanById,
);
router.patch(
  "/subscription-plans/:id",
  ...crmGuards,
  ensureBiodropsPlanParam,
  forceBiodropsPlanBrand,
  updateSubscriptionPlan,
);
router.delete(
  "/subscription-plans/:id",
  ...crmGuards,
  ensureBiodropsPlanParam,
  deleteSubscriptionPlan,
);

export default router;
