import express from "express";
import { getMandiPrices } from "../controllers/mandi/mandi.controller.js";

const router = express.Router();

// Public, like the data it caches (government open data).
router.get("/prices", getMandiPrices);

export default router;
