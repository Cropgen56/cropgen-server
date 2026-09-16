import express from "express";
import { getLogs } from "../controllers/log/log.controller.js";
import {
  isAuthenticated,
  authorizeAdminOrOrgScoped,
} from "../middleware/auth.middleware.js";

const router = express.Router();

router.get("/", isAuthenticated, authorizeAdminOrOrgScoped, getLogs);

export default router;
