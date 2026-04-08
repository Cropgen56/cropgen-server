import express from "express";

import {
  requestOtp,
  verifyOtp,
  refreshTokenHandler,
  completeProfile,
  cropydealsRegisterLogin,
  logoutHandler,
  loginWithGoogleWeb,
  loginWithGoogleMobile,
  requestAdminOtp,
  getAvatarPresignedUrl,
  getProfile,
  getAllUsers,
  getUserById,
  deleteUserById,
  updateUserById,
  deleteUserByEmail,
  checkUser,
  signupWithFirebase,
  isUserExist,
  loginWithPhone,
  sendWhatsappOtp,
  verifyWhatsappOtp,
  resendWhatsappOtp,
  biodropsSendWhatsappOtp,
  biodropsVerifyWhatsappOtp,
  biodropsResendWhatsappOtp,
} from "../controllers/authcontroller/index.js";

import {
  requireAuth,
  isAuthenticated,
  authorizeRoles,
  checkApiKey,
} from "../middleware/auth.middleware.js";
import { updateUserActivity } from "../middleware/update.user.activity.middleware.js";

const router = express.Router();

const forceBiodropsBrand = (req, _res, next) => {
  req.headers["x-client-brand"] = "biodrops";
  req.body = { ...(req.body || {}), clientBrand: "biodrops" };
  next();
};

router.get(
  "/users",
  isAuthenticated,
  updateUserActivity,
  authorizeRoles("admin", "developer", "client"),
  getAllUsers,
);

router.post(
  "/avatar-presign",
  isAuthenticated,
  updateUserActivity,
  getAvatarPresignedUrl,
);

router.get(
  "/user/:id",
  isAuthenticated,
  updateUserActivity,
  authorizeRoles("admin", "developer", "client"),
  getUserById,
);

router.delete(
  "/delete-user/:id",
  isAuthenticated,
  authorizeRoles("admin", "developer", "client"),
  deleteUserById,
);
router.delete("/delete-user-by-email/:email", checkApiKey, deleteUserByEmail);
router.patch(
  "/update-user/:id",
  isAuthenticated,
  updateUserActivity,
  authorizeRoles("admin", "developer", "client", "farmer"),
  updateUserById,
);

// mobile application authentication routes
router.post("/signup/check-user", checkUser);
router.post("/signup/mobile", signupWithFirebase);
router.post("/login/is-exist", isUserExist);
router.post("/login/mobile", loginWithPhone);
router.post("/google-mobile", loginWithGoogleMobile);

// web application login and the singup routes
router.post("/otp", requestOtp);
router.post("/verify", verifyOtp);
router.post("/complete-profile", requireAuth, completeProfile);
router.post("/refresh", refreshTokenHandler);
router.post("/logout", logoutHandler);
router.post("/google", loginWithGoogleWeb);

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
router.post("/biodrops/login/google", forceBiodropsBrand, loginWithGoogleWeb);

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

// request admin otp
router.post("/admin-otp", requestAdminOtp);

// cropydeals register login api
router.post("/cropydeal-register-login", cropydealsRegisterLogin);

// whatsapp otp authentication routes
router.post("/send-otp", sendWhatsappOtp);
router.post("/verify-otp", verifyWhatsappOtp);
router.post("/resend-otp", resendWhatsappOtp);

// profile route
router.get("/profile", isAuthenticated, updateUserActivity, getProfile);

export default router;
