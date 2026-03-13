import multer from "multer";
import path from "path";
import fs from "fs";
import { uploadFileToS3, getS3Url, deleteFileFromS3 } from "../utils/s3.js";

// Multer temp storage
const tempStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = "uploads/";
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  },
});

// File filter for image validation
const fileFilter = (req, file, cb) => {
  const filetypes = /jpeg|jpg|png/;
  const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = filetypes.test(file.mimetype);
  if (extname && mimetype) {
    return cb(null, true);
  }
  cb(new Error("Only JPEG and PNG images are allowed"));
};

const upload = multer({
  storage: tempStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter,
});

// ==================== CROP IMAGE UPLOAD ====================
export const uploadCropImages = (req, res, next) => {
  upload.any()(req, res, async (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({
          success: false,
          message: `File too large. Maximum size is 5 MB.`,
        });
      }
      return res.status(400).json({
        success: false,
        message: err.message || "Error uploading images",
      });
    } else if (err) {
      console.error("Upload error:", err);
      return res.status(400).json({
        success: false,
        message: "Error uploading images",
      });
    }

    let s3Uploads = [];
    try {
      // Upload each file to S3 and get full URLs
      s3Uploads = await Promise.all(
        (req.files || []).map(async (file) => {
          let folder = "misc";
          if (file.fieldname === "cropImage") folder = "crops";
          else if (file.fieldname.startsWith("pestImages")) folder = "pests";
          else if (file.fieldname.startsWith("diseaseImages"))
            folder = "diseases";
          else if (file.fieldname.startsWith("newPestImages"))
            folder = "newPests";
          else if (file.fieldname.startsWith("newDiseaseImages"))
            folder = "newDiseases";

          const key = await uploadFileToS3(file, folder);
          const url = getS3Url(key);
          if (!url) {
            throw new Error(`Failed to generate S3 URL for key: ${key}`);
          }
          return { fieldname: file.fieldname, key, url };
        })
      );

      // Group the uploaded files with keys and URLs
      const groupedFiles = {
        cropImage: s3Uploads
          .filter((f) => f.fieldname === "cropImage")
          .map((f) => ({ fieldname: f.fieldname, key: f.key, url: f.url }))
          .slice(0, 1), // Only one crop image
        pestImages: s3Uploads
          .filter((f) => f.fieldname.startsWith("pestImages"))
          .map((f) => ({ fieldname: f.fieldname, key: f.key, url: f.url })),
        diseaseImages: s3Uploads
          .filter((f) => f.fieldname.startsWith("diseaseImages"))
          .map((f) => ({ fieldname: f.fieldname, key: f.key, url: f.url })),
        newPestImages: s3Uploads
          .filter((f) => f.fieldname.startsWith("newPestImages"))
          .map((f) => ({ fieldname: f.fieldname, key: f.key, url: f.url })),
        newDiseaseImages: s3Uploads
          .filter((f) => f.fieldname.startsWith("newDiseaseImages"))
          .map((f) => ({ fieldname: f.fieldname, key: f.key, url: f.url })),
      };

      // Validate required images for create operation
      if (req.path.includes("/create")) {
        if (
          !groupedFiles.cropImage.length ||
          !groupedFiles.pestImages.length ||
          !groupedFiles.diseaseImages.length
        ) {
          // Clean up uploaded files from S3
          for (const file of s3Uploads) {
            if (file.key) {
              await deleteFileFromS3(file.key).catch((err) => {
                console.error(
                  `Failed to delete image from S3: ${file.key}`,
                  err
                );
              });
            }
          }
          return res.status(400).json({
            success: false,
            message:
              "Crop image, at least one pest image, and one disease image are required",
          });
        }
      }

      req.files = groupedFiles;
      next();
    } catch (uploadErr) {
      console.error("S3 upload error:", uploadErr);
      // Clean up uploaded files from S3
      for (const file of s3Uploads) {
        if (file.key) {
          await deleteFileFromS3(file.key).catch((err) => {
            console.error(`Failed to delete image from S3: ${file.key}`, err);
          });
        }
      }
      return res.status(500).json({
        success: false,
        message: `Failed to upload to S3: ${uploadErr.message}`,
      });
    }
  });
};

// ==================== BLOG IMAGE UPLOAD ====================
export const uploadBlogImages = (req, res, next) => {
  upload.single("blogImage")(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ success: false, message: err.message });
    }

    try {
      const key = await uploadFileToS3(req.file, "blogs");
      const url = getS3Url(key);
      if (!url) {
        throw new Error(`Failed to generate S3 URL for key: ${key}`);
      }
      req.file = { ...req.file, key, url };
      next();
    } catch (uploadErr) {
      console.error("S3 upload error:", uploadErr);
      return res.status(500).json({
        success: false,
        message: `Failed to upload blog image: ${uploadErr.message}`,
      });
    }
  });
};

export default { uploadCropImages, uploadBlogImages };
