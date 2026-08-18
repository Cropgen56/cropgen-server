import mongoose from "mongoose";
import FarmField from "../../models/field.model.js";
import FieldCrop from "../../models/field-crop.model.js";
import {
  fieldCropCreateSchema,
  fieldCropUpdateSchema,
} from "../../validation/field-crop/schema.js";
import { triggerInitialAdvisoryForNewCrop } from "../../features/advisory/services/triggerInitialAdvisory.service.js";

async function findFarmField(fieldId, res) {
  if (!mongoose.Types.ObjectId.isValid(fieldId)) {
    res.status(400).json({ success: false, message: "Invalid field ID." });
    return null;
  }
  const farmField = await FarmField.findById(fieldId);
  if (!farmField) {
    res.status(404).json({ success: false, message: "Farm field not found." });
    return null;
  }
  return farmField;
}

// Add another crop to an existing farm.
export const addCropToField = async (req, res) => {
  try {
    const { fieldId } = req.params;
    const farmField = await findFarmField(fieldId, res);
    if (!farmField) return;

    const { error, value } = fieldCropCreateSchema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true,
    });
    if (error) {
      return res.status(400).json({
        success: false,
        message: "Validation error.",
        error: error.details.map((d) => d.message).join(", "),
      });
    }

    const cropInstance = await FieldCrop.create({
      ...value,
      farmField: farmField._id,
      user: farmField.user,
    });

    // A farm that was barren now has a crop growing on it.
    if (farmField.isBarrenLand) {
      farmField.isBarrenLand = false;
      await farmField.save();
    }

    // Generate this crop's first advisory in the background (mirrors addField).
    void triggerInitialAdvisoryForNewCrop(farmField._id, cropInstance._id, {
      userId: String(farmField.user),
    });

    return res.status(201).json({
      success: true,
      message: "Crop added successfully.",
      crop: cropInstance,
    });
  } catch (error) {
    console.error("Error adding crop to field:", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

// List all crops (active + historical) for a farm.
export const getCropsForField = async (req, res) => {
  try {
    const { fieldId } = req.params;
    const farmField = await findFarmField(fieldId, res);
    if (!farmField) return;

    const crops = await FieldCrop.find({ farmField: farmField._id })
      .sort({ isActive: -1, createdAt: -1 })
      .lean();

    return res.status(200).json({
      success: true,
      message: "Crops retrieved successfully.",
      crops,
    });
  } catch (error) {
    console.error("Error fetching crops for field:", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

// Edit a crop, or mark it harvested/inactive.
export const updateCropForField = async (req, res) => {
  try {
    const { fieldId, cropId } = req.params;
    const farmField = await findFarmField(fieldId, res);
    if (!farmField) return;

    if (!mongoose.Types.ObjectId.isValid(cropId)) {
      return res.status(400).json({ success: false, message: "Invalid crop ID." });
    }

    const { error, value } = fieldCropUpdateSchema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true,
    });
    if (error) {
      return res.status(400).json({
        success: false,
        message: "Validation error.",
        error: error.details.map((d) => d.message).join(", "),
      });
    }

    // Deactivating a crop (harvest) without an explicit actualEndDate stamps "now".
    if (value.isActive === false && !value.actualEndDate) {
      value.actualEndDate = new Date();
    }

    const cropInstance = await FieldCrop.findOneAndUpdate(
      { _id: cropId, farmField: farmField._id },
      { $set: value },
      { new: true, runValidators: true },
    );

    if (!cropInstance) {
      return res.status(404).json({ success: false, message: "Crop not found on this farm." });
    }

    // If no crop is active anymore, the farm is effectively barren again.
    if (value.isActive === false) {
      const remainingActive = await FieldCrop.countDocuments({
        farmField: farmField._id,
        isActive: true,
      });
      if (remainingActive === 0 && !farmField.isBarrenLand) {
        farmField.isBarrenLand = true;
        await farmField.save();
      }
    }

    return res.status(200).json({
      success: true,
      message: "Crop updated successfully.",
      crop: cropInstance,
    });
  } catch (error) {
    console.error("Error updating crop:", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

// Remove a mistakenly-added crop.
export const deleteCropForField = async (req, res) => {
  try {
    const { fieldId, cropId } = req.params;
    const farmField = await findFarmField(fieldId, res);
    if (!farmField) return;

    if (!mongoose.Types.ObjectId.isValid(cropId)) {
      return res.status(400).json({ success: false, message: "Invalid crop ID." });
    }

    const deleted = await FieldCrop.findOneAndDelete({
      _id: cropId,
      farmField: farmField._id,
    });

    if (!deleted) {
      return res.status(404).json({ success: false, message: "Crop not found on this farm." });
    }

    if (deleted.isActive) {
      const remainingActive = await FieldCrop.countDocuments({
        farmField: farmField._id,
        isActive: true,
      });
      if (remainingActive === 0 && !farmField.isBarrenLand) {
        farmField.isBarrenLand = true;
        await farmField.save();
      }
    }

    return res.status(200).json({
      success: true,
      message: "Crop deleted successfully.",
      crop: deleted,
    });
  } catch (error) {
    console.error("Error deleting crop:", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};
