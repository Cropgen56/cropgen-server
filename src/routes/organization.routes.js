import express from "express";
import {
  createOrganization,
  deleteOrganization,
  getAllOrganizations,
  getOrganizationById,
  updateOrganization,
} from "../controllers/organization.controller.js";
import {
  isAuthenticated,
  authorizeRoles,
} from "../middleware/auth.middleware.js";

const router = express.Router();

router.post(
  "/create",
  isAuthenticated,
  authorizeRoles("admin", "developer"),
  createOrganization,
);

router.get(
  "/get",
  isAuthenticated,
  authorizeRoles("admin", "developer"),
  getAllOrganizations,
);

router.get(
  "/get/:id",
  isAuthenticated,
  authorizeRoles("admin", "developer"),
  getOrganizationById,
);

router.patch(
  "/update/:id",
  isAuthenticated,
  authorizeRoles("admin", "developer"),
  updateOrganization,
);

router.delete(
  "/delete/:id",
  isAuthenticated,
  authorizeRoles("admin", "developer"),
  deleteOrganization,
);

export default router;
