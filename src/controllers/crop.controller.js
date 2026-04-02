import Crop from "../models/crop.model.js";
import { deleteFileFromS3 } from "../utils/s3.js";
import { cropValidationSchema } from "../validation/cropValidationSchema.js";

// create the crop information
export const createCrop = async (req, res) => {
  try {
    //  Helper to parse JSON strings safely
    const parseIfString = (data, fieldName) => {
      if (typeof data !== "string") return data;
      try {
        return JSON.parse(data);
      } catch (err) {
        throw new SyntaxError(`Invalid JSON format in ${fieldName}`);
      }
    };

    //  Parse nested fields (if sent as JSON string)
    req.body.climate = parseIfString(req.body.climate, "climate");
    req.body.variety = parseIfString(req.body.variety, "variety");
    req.body.nursery = parseIfString(req.body.nursery, "nursery");
    req.body.sowing = parseIfString(req.body.sowing, "sowing");
    req.body.fertilizer = parseIfString(req.body.fertilizer, "fertilizer");
    req.body.seed = parseIfString(req.body.seed, "seed");
    req.body.pestProtection = parseIfString(
      req.body.pestProtection,
      "pestProtection"
    );
    req.body.diseaseProtection = parseIfString(
      req.body.diseaseProtection,
      "diseaseProtection"
    );

    // Validate with Joi
    const { error, value } = cropValidationSchema.validate(req.body, {
      abortEarly: false,
    });
    if (error) {
      return res.status(400).json({
        success: false,
        message: error.details.map((d) => d.message).join(", "),
      });
    }

    // Ensure required images
    if (
      !req.files?.cropImage?.length ||
      !req.files?.pestImages?.length ||
      !req.files?.diseaseImages?.length
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Crop image, at least one pest image, and one disease image are required",
      });
    }

    // Map S3 image URLs
    const cropImage = req.files.cropImage[0].url;

    const pestProtectionWithImages = value.pestProtection.map(
      (pest, index) => ({
        ...pest,
        image: req.files.pestImages
          .filter((f) => f.fieldname.includes(`[${index}]`))
          .map((f) => f.url),
      })
    );

    const diseaseProtectionWithImages = value.diseaseProtection.map(
      (disease, index) => ({
        ...disease,
        image: req.files.diseaseImages
          .filter((f) => f.fieldname.includes(`[${index}]`))
          .map((f) => f.url),
      })
    );

    // Prevent duplicate crop
    const existingCrop = await Crop.findOne({
      cropName: value.cropName.toLowerCase(),
    });
    if (existingCrop) {
      return res.status(409).json({
        success: false,
        message: "A crop with this name already exists",
      });
    }

    // Save crop
    const crop = new Crop({
      ...value,
      cropName: value.cropName.toLowerCase(),
      cropImage,
      pestProtection: pestProtectionWithImages,
      diseaseProtection: diseaseProtectionWithImages,
    });

    const savedCrop = await crop.save();

    return res.status(201).json({
      success: true,
      data: savedCrop,
      message: "Crop created successfully",
    });
  } catch (error) {
    //  Rollback uploaded images on error
    if (req.files) {
      const allFiles = [
        ...(req.files.cropImage || []),
        ...(req.files.pestImages || []),
        ...(req.files.diseaseImages || []),
      ];
      for (const f of allFiles) {
        await deleteFileFromS3(f.key).catch(() =>
          console.error("Failed to delete S3 file", f.key)
        );
      }
    }

    if (error instanceof SyntaxError) {
      return res.status(400).json({ success: false, message: error.message });
    }

    console.error("Error in createCrop:", error);
    return res
      .status(500)
      .json({ success: false, message: "Server error while creating crop" });
  }
};

// update the crop information
export const updateCrop = async (req, res) => {
  try {
    const {
      cropName,
      generalInfo,
      climate,
      soil,
      variety,
      nursery,
      sowing,
      fertilizer,
      landPreparation,
      seed,
      pestProtection,
      diseaseProtection,
      weedControl,
      irrigation,
      harvesting,
      postHarvesting,
      removeCropImage,
    } = req.body;

    const parseIfString = (data, fieldName) => {
      try {
        return typeof data === "string" ? JSON.parse(data) : data;
      } catch (err) {
        throw new SyntaxError(
          `Invalid JSON format in ${fieldName}: ${err.message}`
        );
      }
    };

    const crop = await Crop.findById(req.params.id);
    if (!crop) {
      return res
        .status(404)
        .json({ success: false, message: "Crop not found" });
    }

    // Store old crop image for cleanup (full URL)
    const oldCropImage = crop.cropImage;

    // Update basic fields
    if (cropName) {
      const existingCrop = await Crop.findOne({
        cropName: cropName.toLowerCase(),
        _id: { $ne: crop._id },
      });
      if (existingCrop) {
        return res.status(409).json({
          success: false,
          message: "A crop with this name already exists",
        });
      }
      crop.cropName = cropName.toLowerCase();
    }
    if (generalInfo) crop.generalInfo = generalInfo;
    if (climate) crop.climate = parseIfString(climate, "climate");
    if (soil) crop.soil = soil;
    if (variety) crop.variety = parseIfString(variety, "variety");
    if (nursery) crop.nursery = parseIfString(nursery, "nursery");
    if (sowing) crop.sowing = parseIfString(sowing, "sowing");
    if (fertilizer) crop.fertilizer = parseIfString(fertilizer, "fertilizer");
    if (landPreparation) crop.landPreparation = landPreparation;
    if (seed) crop.seed = parseIfString(seed, "seed");
    if (weedControl) crop.weedControl = weedControl;
    if (irrigation) crop.irrigation = irrigation;
    if (harvesting) crop.harvesting = harvesting;
    if (postHarvesting) crop.postHarvesting = postHarvesting;

    // Extract S3 base URL for parsing keys
    const bucketName = process.env.S3_BUCKET_NAME;
    const region = process.env.AWS_REGION;
    const baseUrl = `https://${bucketName}.s3.${region}.amazonaws.com/`;

    // Handle crop image
    let imagesToDelete = [];
    if (removeCropImage === "true") {
      if (!req.files?.cropImage?.[0]?.url) {
        return res.status(400).json({
          success: false,
          message: "A new crop image is required if removing the existing one",
        });
      }
      if (oldCropImage) {
        imagesToDelete.push(oldCropImage);
      }
      crop.cropImage = req.files.cropImage[0].url;
    } else if (req.files?.cropImage?.[0]?.url) {
      if (oldCropImage) {
        imagesToDelete.push(oldCropImage);
      }
      crop.cropImage = req.files.cropImage[0].url;
    }

    // Handle pestProtection
    if (pestProtection) {
      const parsedPestProtection = parseIfString(
        pestProtection,
        "pestProtection"
      );
      const oldPestImages = crop.pestProtection.map((p) => p.image).flat();
      const newPestImagesGrouped = {};
      if (req.files?.newPestImages) {
        req.files.newPestImages.forEach((file) => {
          const match = file.fieldname.match(/newPestImages\[(\d+)\]\[\d+\]/);
          if (match) {
            const pestIndex = parseInt(match[1], 10);
            if (!newPestImagesGrouped[pestIndex]) {
              newPestImagesGrouped[pestIndex] = [];
            }
            newPestImagesGrouped[pestIndex].push(file.url);
          }
        });
      }
      const pestProtectionWithImages = parsedPestProtection.map(
        (pest, index) => {
          const newImages = newPestImagesGrouped[index] || [];
          const existingImages = pest.image || [];
          const combinedImages = [...existingImages, ...newImages];
          if (combinedImages.length < 1 || combinedImages.length > 5) {
            throw new Error(`Pest at index ${index} must have 1-5 images`);
          }
          return { ...pest, image: combinedImages };
        }
      );
      crop.pestProtection = pestProtectionWithImages;

      // Mark old pest images for deletion
      const newPestImages = pestProtectionWithImages.map((p) => p.image).flat();
      imagesToDelete.push(
        ...oldPestImages.filter((img) => !newPestImages.includes(img))
      );
    }

    // Handle diseaseProtection
    if (diseaseProtection) {
      const parsedDiseaseProtection = parseIfString(
        diseaseProtection,
        "diseaseProtection"
      );
      const oldDiseaseImages = crop.diseaseProtection
        .map((d) => d.image)
        .flat();
      const newDiseaseImagesGrouped = {};
      if (req.files?.newDiseaseImages) {
        req.files.newDiseaseImages.forEach((file) => {
          const match = file.fieldname.match(
            /newDiseaseImages\[(\d+)\]\[\d+\]/
          );
          if (match) {
            const diseaseIndex = parseInt(match[1], 10);
            if (!newDiseaseImagesGrouped[diseaseIndex]) {
              newDiseaseImagesGrouped[diseaseIndex] = [];
            }
            newDiseaseImagesGrouped[diseaseIndex].push(file.url);
          }
        });
      }
      const diseaseProtectionWithImages = parsedDiseaseProtection.map(
        (disease, index) => {
          const newImages = newDiseaseImagesGrouped[index] || [];
          const existingImages = disease.image || [];
          const combinedImages = [...existingImages, ...newImages];
          if (combinedImages.length < 1 || combinedImages.length > 5) {
            throw new Error(`Disease at index ${index} must have 1-5 images`);
          }
          return { ...disease, image: combinedImages };
        }
      );
      crop.diseaseProtection = diseaseProtectionWithImages;

      // Mark old disease images for deletion
      const newDiseaseImages = diseaseProtectionWithImages
        .map((d) => d.image)
        .flat();
      imagesToDelete.push(
        ...oldDiseaseImages.filter((img) => !newDiseaseImages.includes(img))
      );
    }

    // Save the updated crop
    const savedCrop = await crop.save();

    // Clean up old images from S3
    for (const image of imagesToDelete) {
      if (!image) {
        console.warn("Skipping deletion of undefined image URL");
        continue;
      }
      const key = image.startsWith(baseUrl)
        ? image.replace(baseUrl, "")
        : image;
      if (key) {
        await deleteFileFromS3(key).catch((err) => {
          console.error(`Failed to delete image from S3: ${key}`, err);
        });
      }
    }

    return res.status(200).json({
      success: true,
      data: {
        ...savedCrop.toJSON(),
        varietyCount: savedCrop.varietyCount,
      },
      message: "Crop updated successfully",
    });
  } catch (error) {
    // Clean up new images from S3 on error
    if (req.files) {
      const images = [
        ...(req.files.cropImage || []),
        ...(req.files.newPestImages || []),
        ...(req.files.newDiseaseImages || []),
      ].filter((image) => image && image.key);

      for (const image of images) {
        await deleteFileFromS3(image.key).catch((err) => {
          console.error(`Failed to delete image from S3: ${image.key}`, err);
        });
      }
    }

    console.error("Error in updateCrop:", error);
    if (error instanceof SyntaxError) {
      return res.status(400).json({ success: false, message: error.message });
    }
    if (error.message.includes("must have 1-5 images")) {
      return res.status(400).json({ success: false, message: error.message });
    }
    if (error.name === "ValidationError") {
      const errors = Object.values(error.errors).map((err) => err.message);
      return res.status(400).json({
        success: false,
        message: `Validation failed: ${errors.join(", ")}`,
      });
    }
    if (
      error.message.includes("AccessDenied") ||
      error.message.includes("AccessControlListNotSupported")
    ) {
      return res.status(403).json({
        success: false,
        message:
          "Access denied to S3 bucket. Check bucket permissions or IAM credentials.",
      });
    }
    return res.status(500).json({
      success: false,
      message: "Server error while updating crop",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// Get all crops deteails
export const getAllCrops = async (req, res) => {
  try {
    // Query parameters for pagination and sorting
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 5;
    const skip = (page - 1) * limit;
    const sort = req.query.sort || "-createdAt";

    // Search query
    const search = req.query.search
      ? { cropName: { $regex: req.query.search, $options: "i" } }
      : {};

    // Fetch crops with pagination, sorting, and search
    const crops = await Crop.find(search)
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .lean();

    // Get total count for pagination
    const totalCrops = await Crop.countDocuments(search);

    return res.status(200).json({
      success: true,
      data: crops,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalCrops / limit),
        totalCrops,
        limit,
      },
      message: "Crops retrieved successfully",
    });
  } catch (error) {
    console.error("Error in getAllCrops:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while retrieving crops",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// Get single crop by ID
export const getCropById = async (req, res) => {
  try {
    const { id } = req.params;

    // Validate ID format
    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        success: false,
        message: "Invalid crop ID format",
      });
    }

    const crop = await Crop.findById(id).lean();

    if (!crop) {
      return res.status(404).json({
        success: false,
        message: "Crop not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        ...crop,
        varietyCount: crop.variety.length,
      },
      message: "Crop retrieved successfully",
    });
  } catch (error) {
    console.error("Error in getCropById:", error);
    if (error.name === "CastError") {
      return res.status(400).json({
        success: false,
        message: "Invalid crop ID",
      });
    }
    return res.status(500).json({
      success: false,
      message: "Server error while retrieving crop",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// get list of crop with name image and id
export const getCropNamesAndImages = async (req, res) => {
  try {
    // Fetch only cropName, cropImage, and _id fields
    const crops = await Crop.find()
      .select("cropName cropImage _id")
      .lean()
      .exec();

    if (!crops || crops.length === 0) {
      return res.status(200).json({
        success: true,
        data: [],
        message: "No crops in database yet",
      });
    }

    return res.status(200).json({
      success: true,
      data: crops,
      message: "Crops retrieved successfully",
    });
  } catch (error) {
    console.error("Error in getCropNamesAndImages:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while retrieving crops",
      error: process.env.NODE_ENV === "development" ? error.stack : undefined,
    });
  }
};

// Delete crop by ID
export const deleteCropById = async (req, res) => {
  try {
    const { id } = req.params;

    // Validate ID format
    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        success: false,
        message: "Invalid crop ID format",
      });
    }

    const crop = await Crop.findById(id);

    if (!crop) {
      return res.status(404).json({
        success: false,
        message: "Crop not found",
      });
    }

    // Extract S3 keys from image URLs
    const bucketName = process.env.S3_BUCKET_NAME;
    const region = process.env.AWS_REGION;
    const baseUrl = `https://${bucketName}.s3.${region}.amazonaws.com/`;

    const imagesToDelete = [
      crop.cropImage,
      ...crop.pestProtection.flatMap((pest) => pest.image || []),
      ...crop.diseaseProtection.flatMap((disease) => disease.image || []),
    ].filter(Boolean);

    // Delete images from S3
    for (const imageUrl of imagesToDelete) {
      // Extract S3 key from URL (e.g., crops/123456-image.jpg)
      const key = imageUrl.replace(baseUrl, "");
      await deleteFileFromS3(key).catch((err) => {
        console.error(`Failed to delete image from S3: ${key}`, err);
      });
    }

    // Delete the crop document
    await Crop.findByIdAndDelete(id);

    return res.status(200).json({
      success: true,
      message: "Crop and associated images deleted successfully",
    });
  } catch (error) {
    console.error("Error in deleteCropById:", error);
    if (error.name === "CastError") {
      return res.status(400).json({
        success: false,
        message: "Invalid crop ID",
      });
    }
    if (error.message.includes("AccessDenied")) {
      return res.status(403).json({
        success: false,
        message:
          "Access denied to S3 bucket. Check bucket permissions or IAM credentials.",
      });
    }
    return res.status(500).json({
      success: false,
      message: "Server error while deleting crop",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};
