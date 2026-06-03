import express from "express";
import biodropsAuthRoutes from "./auth.routes.js";
import biodropsAdminAssignmentRoutes from "./admin-assignment.routes.js";
import biodropsCrmRoutes from "./crm.routes.js";

const router = express.Router();

router.use(biodropsAuthRoutes);
router.use("/admin-assignments", biodropsAdminAssignmentRoutes);
router.use("/crm", biodropsCrmRoutes);

export default router;
