import express from "express";
import { isAuthenticated } from "../../../middleware/auth.middleware.js";
import { updateUserActivity } from "../../../middleware/update.user.activity.middleware.js";
import {
  attachBiodropsAdminActor,
  requireBiodropsAdminAccess,
  requireBiodropsClientViewer,
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
import {
  getCrmFarmerFields,
  getCrmFieldAdvisories,
} from "../controllers/farmers/farmer-fields.controller.js";
import {
  listCrmClients,
  getCrmClientById,
  createCrmClient,
  updateCrmClient,
  assignFarmerToClient,
} from "../controllers/clients/clients.controller.js";
import {
  listCrmProducts,
  getCrmProductById,
  createCrmProduct,
  updateCrmProduct,
  archiveCrmProduct,
  getCrmProductImagePresign,
} from "../controllers/products/index.js";
import {
  listCrmOrders,
  getCrmOrderStats,
  getCrmOrderById,
  updateCrmOrder,
  cancelCrmOrder,
  getCrmOrderInvoice,
} from "../controllers/orders/index.js";
import { listCrmShopPayments } from "../controllers/ecommerce/list-crm-payments.controller.js";
import {
  listClientCreditPlans,
  getClientCreditPlan,
  createClientCreditPlan,
  updateClientCreditPlan,
  deleteClientCreditPlan,
  getClientCreditsOverview,
  getClientCreditsDetail,
} from "../controllers/client-credits/admin.controller.js";
import {
  getMyClientCredits,
  listMyClientCreditPlans,
  listMyClientCreditUsage,
  createMyClientCreditPurchase,
  verifyMyClientCreditPurchase,
  cancelMyClientCreditPurchase,
} from "../controllers/client-credits/client.controller.js";

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

/** Read-only routes that client viewers may also use (scoped to their farmers). */
const crmReadGuards = [
  isAuthenticated,
  updateUserActivity,
  attachBiodropsAdminActor,
  requireBiodropsAdminAccess({
    minLevel: "ground",
    roles: ["admin", "developer", "staff"],
    allowClientViewer: true,
  }),
];

/** Client management: CropGen platform admins and BioDrops super admins. */
const crmSuperGuards = [
  isAuthenticated,
  updateUserActivity,
  attachBiodropsAdminActor,
  requireBiodropsAdminAccess({
    minLevel: "super",
    roles: ["admin", "developer", "staff"],
  }),
];

/** A client's own credit balance and purchases (client viewer logins only). */
const crmClientGuards = [
  isAuthenticated,
  updateUserActivity,
  attachBiodropsAdminActor,
  requireBiodropsClientViewer,
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

router.get("/farmers/stats", ...crmReadGuards, getBiodropsFarmerStats);
router.get("/farmers/:id/fields", ...crmReadGuards, getCrmFarmerFields);
router.patch("/farmers/:id/client", ...crmSuperGuards, assignFarmerToClient);
router.get("/farmers/:id", ...crmReadGuards, getBiodropsFarmerById);
router.get("/farmers", ...crmReadGuards, listBiodropsFarmers);
router.get("/fields/:fieldId/advisories", ...crmReadGuards, getCrmFieldAdvisories);

router.get("/clients", ...crmSuperGuards, listCrmClients);
router.post("/clients", ...crmSuperGuards, createCrmClient);
router.get("/clients/:id", ...crmSuperGuards, getCrmClientById);
router.patch("/clients/:id", ...crmSuperGuards, updateCrmClient);

router.get("/client-credit-plans", ...crmSuperGuards, listClientCreditPlans);
router.post("/client-credit-plans", ...crmSuperGuards, createClientCreditPlan);
router.get("/client-credit-plans/:id", ...crmSuperGuards, getClientCreditPlan);
router.patch("/client-credit-plans/:id", ...crmSuperGuards, updateClientCreditPlan);
router.delete("/client-credit-plans/:id", ...crmSuperGuards, deleteClientCreditPlan);
router.get("/client-credits/overview", ...crmSuperGuards, getClientCreditsOverview);
router.get(
  "/client-credits/clients/:clientId",
  ...crmSuperGuards,
  getClientCreditsDetail,
);

router.get("/client-credits/me", ...crmClientGuards, getMyClientCredits);
router.get("/client-credits/me/plans", ...crmClientGuards, listMyClientCreditPlans);
router.get("/client-credits/me/usage", ...crmClientGuards, listMyClientCreditUsage);
router.post(
  "/client-credits/me/purchases",
  ...crmClientGuards,
  createMyClientCreditPurchase,
);
router.post(
  "/client-credits/me/purchases/:id/verify",
  ...crmClientGuards,
  verifyMyClientCreditPurchase,
);
router.post(
  "/client-credits/me/purchases/:id/cancel",
  ...crmClientGuards,
  cancelMyClientCreditPurchase,
);

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
  ...crmReadGuards,
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

router.get("/products", ...crmGuards, listCrmProducts);
router.post("/products/image-presign", ...crmGuards, getCrmProductImagePresign);
router.post("/products", ...crmGuards, createCrmProduct);
router.get("/products/:id", ...crmGuards, getCrmProductById);
router.patch("/products/:id", ...crmGuards, updateCrmProduct);
router.delete("/products/:id", ...crmGuards, archiveCrmProduct);

router.get("/ecommerce/payments", ...crmGuards, listCrmShopPayments);

router.get("/orders/stats", ...crmGuards, getCrmOrderStats);
router.get("/orders", ...crmGuards, listCrmOrders);
router.get("/orders/:id/invoice/html", ...crmGuards, getCrmOrderInvoice);
router.get("/orders/:id/invoice", ...crmGuards, getCrmOrderInvoice);
router.post("/orders/:id/cancel", ...crmGuards, cancelCrmOrder);
router.get("/orders/:id", ...crmGuards, getCrmOrderById);
router.patch("/orders/:id", ...crmGuards, updateCrmOrder);

export default router;
