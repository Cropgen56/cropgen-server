import express from "express";
import { getMandiPrices, getTradedCrops } from "../controllers/mandi/mandi.controller.js";

const router = express.Router();

// Public, like the data it caches (government open data).
router.get("/prices", getMandiPrices);
router.get("/traded-crops", getTradedCrops);

export default router;
