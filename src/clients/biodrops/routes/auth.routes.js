import express from "express";
import {
  requestOtp,
  verifyOtp,
  completeProfile,
  loginWithGoogleWebBiodrops,
  loginWithGoogleMobileBiodrops,
} from "../../../controllers/auth/index.js";
import { requireAuth } from "../../../middleware/auth.middleware.js";
import { forceBiodropsBrand } from "../middleware/forceBrand.middleware.js";
import {
  biodropsSendWhatsappOtp,
  biodropsVerifyWhatsappOtp,
  biodropsResendWhatsappOtp,
} from "../controllers/whatsapp.controller.js";
import {
  redeemAccessCard,
  getAccessCardEntitlement,
} from "../controllers/access-cards/redeem.controller.js";

const router = express.Router();

// biodrops web application dedicated auth routes
router.post("/biodrops/signup/otp", forceBiodropsBrand, requestOtp);
router.post("/biodrops/signup/verify", forceBiodropsBrand, verifyOtp);
router.post(
  "/biodrops/signup/complete-profile",
  forceBiodropsBrand,
  requireAuth,
  completeProfile,
);
router.post("/biodrops/login/otp", forceBiodropsBrand, requestOtp);
router.post("/biodrops/login/verify", forceBiodropsBrand, verifyOtp);
router.post(
  "/biodrops/login/google",
  forceBiodropsBrand,
  loginWithGoogleWebBiodrops,
);
router.post(
  "/biodrops/login/google-mobile",
  forceBiodropsBrand,
  loginWithGoogleMobileBiodrops,
);

// biodrops web application — WhatsApp OTP (phone login)
router.post(
  "/biodrops/whatsapp/otp",
  forceBiodropsBrand,
  biodropsSendWhatsappOtp,
);
router.post(
  "/biodrops/whatsapp/verify",
  forceBiodropsBrand,
  biodropsVerifyWhatsappOtp,
);
router.post(
  "/biodrops/whatsapp/resend",
  forceBiodropsBrand,
  biodropsResendWhatsappOtp,
);

router.get(
  "/biodrops/access-cards/entitlement",
  forceBiodropsBrand,
  requireAuth,
  getAccessCardEntitlement,
);
router.post(
  "/biodrops/access-cards/redeem",
  forceBiodropsBrand,
  requireAuth,
  redeemAccessCard,
);

export default router;
