import express from "express";
import { handleContactUs } from "../../../controllers/common/contact.controller.js";

const router = express.Router();

router.post("/contact-us", (req, res) =>
  handleContactUs(req, res, { forcedBrand: "threedot" }),
);

export default router;
