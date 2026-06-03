import express from "express";
import { isAuthenticated } from "../../../middleware/auth.middleware.js";
import {
  attachBiodropsAdminActor,
  requireBiodropsAdminAccess,
} from "../middleware/admin.middleware.js";
import {
  createBiodropsAdminAssignment,
  listBiodropsAdminAssignments,
  getMyBiodropsAdminAssignments,
  suspendBiodropsAdminAssignment,
} from "../controllers/admin-assignment/index.js";

const router = express.Router();

router.get("/me", isAuthenticated, getMyBiodropsAdminAssignments);

router.get(
  "/",
  isAuthenticated,
  attachBiodropsAdminActor,
  requireBiodropsAdminAccess({
    minLevel: "ground",
    roles: ["admin", "developer", "staff"],
  }),
  listBiodropsAdminAssignments,
);

router.post(
  "/",
  isAuthenticated,
  attachBiodropsAdminActor,
  requireBiodropsAdminAccess({
    minLevel: "ground",
    roles: ["admin", "developer", "staff"],
  }),
  createBiodropsAdminAssignment,
);

router.patch(
  "/:id/suspend",
  isAuthenticated,
  attachBiodropsAdminActor,
  requireBiodropsAdminAccess({
    minLevel: "ground",
    roles: ["admin", "developer", "staff"],
  }),
  suspendBiodropsAdminAssignment,
);

export default router;
