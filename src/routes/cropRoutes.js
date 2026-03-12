import express from "express";
import {
  createCrop,
  deleteCropById,
  getAllCrops,
  getCropById,
  getCropNamesAndImages,
  updateCrop,
} from "../controllers/cropController.js";
import {
  isAuthenticated,
  authorizeRoles,
} from "../middleware/authMiddleware.js";
import { uploadCropImages } from "../middleware/uploadImage.js";

const router = express.Router();

router.post(
  "/create",
  isAuthenticated,
  authorizeRoles("admin"),
  uploadCropImages,
  createCrop,
);
router.get("/get-all", isAuthenticated, getAllCrops);
router.get("/get-crop-list", getCropNamesAndImages);
router.get("/get/:id", getCropById);
router.delete(
  "/delete/:id",
  isAuthenticated,
  authorizeRoles("admin"),
  deleteCropById,
);
router.patch(
  "/update/:id",
  isAuthenticated,
  authorizeRoles("admin"),
  uploadCropImages,
  updateCrop,
);

export default router;
