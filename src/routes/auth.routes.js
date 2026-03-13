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
} from "../controllers/authcontroller/index.js";

import {
  requireAuth,
  isAuthenticated,
  authorizeRoles,
  checkApiKey,
} from "../middleware/auth.middleware.js";
import { updateUserActivity } from "../middleware/update.user.activity.middleware.js";

const router = express.Router();

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
