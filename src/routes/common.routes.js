import express from "express";
import { contactUs } from "../controllers/commoncontroller/contact.controller.js";

const router = express.Router();

router.post("/contact-us", contactUs);

export default router;
