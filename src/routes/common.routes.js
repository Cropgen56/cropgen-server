import express from "express";
import { contactUs } from "../controllers/common/contact.controller.js";
import { satagroContactUs } from "../controllers/common/satagroContact.controller.js";
import threedotContactRoutes from "../clients/threedot/routes/contact.routes.js";

const router = express.Router();

router.post("/contact-us", contactUs);
router.post("/satagro/contact-us", satagroContactUs);
router.use("/threedot", threedotContactRoutes);

export default router;
