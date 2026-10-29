import express from "express";
import { requireAuth } from "../../../middleware/auth.middleware.js";
import { forceBiodropsBrand } from "../middleware/forceBrand.middleware.js";
import { assertBiodropsFarmer } from "../utils/shopAuth.util.js";
import { previewClientCreditsForFarmer } from "../services/clientCredits.service.js";

/** Farmer-facing client credit routes → /v1/api/biodrops/client-credits */
const router = express.Router();

router.use(forceBiodropsBrand);

/** GET /preview?acres=2.5 — credits a new farm of this size would use. */
router.get("/preview", requireAuth, async (req, res) => {
  try {
    const { userId } = await assertBiodropsFarmer(req);
    const acres = Number(req.query.acres);
    if (!Number.isFinite(acres) || acres < 0) {
      return res.status(400).json({ success: false, message: "acres must be a positive number" });
    }
    const preview = await previewClientCreditsForFarmer({ userId, acres });
    return res.json({ success: true, ...preview });
  } catch (error) {
    const status = error.status || 500;
    if (status >= 500) console.error("previewClientCredits:", error);
    return res.status(status).json({
      success: false,
      message: status >= 500 ? "Failed to check credits." : error.message,
    });
  }
});

export default router;
