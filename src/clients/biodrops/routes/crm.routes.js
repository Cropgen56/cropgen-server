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
} from "../controllers/user-management/index.js";
import { suspendBiodropsAdminAssignment } from "../controllers/admin-assignment/suspend.admin-assignment.controller.js";
import { createCrmInvitation } from "../controllers/invitations/create.invitation.controller.js";
import { getCrmInvitationByToken } from "../controllers/invitations/get-by-token.controller.js";
import { acceptCrmInvitation } from "../controllers/invitations/accept.invitation.controller.js";
import { resendCrmInvitation } from "../controllers/invitations/resend.invitation.controller.js";
import {
  listBiodropsFarmers,
  getBiodropsFarmerStats,
} from "../controllers/farmers/index.js";

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

router.post("/invitations", ...crmGuards, createCrmInvitation);
router.post(
  "/invitations/resend/:userId",
  ...crmGuards,
  resendCrmInvitation,
);

router.get("/users", ...crmGuards, listBiodropsUsers);

router.get("/farmers/stats", ...crmGuards, getBiodropsFarmerStats);
router.get("/farmers", ...crmGuards, listBiodropsFarmers);

export default router;
