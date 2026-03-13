import express from "express";
import {
  createCrop,
  deleteCropById,
  getAllCrops,
  getCropById,
  getCropNamesAndImages,
  updateCrop,
} from "../controllers/crop.controller.js";
import {
  isAuthenticated,
  authorizeRoles,
} from "../middleware/auth.middleware.js";
import { uploadCropImages } from "../middleware/upload.image.middleware.js";

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
