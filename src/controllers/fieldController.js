import mongoose from "mongoose";
import FarmField from "../models/fieldModel.js";
import User from "../models/usersModel.js";
import UserSubscription from "../models/usersubscription.model.js";
import axios from "axios";

// Add a new farm field for a particular user
export const addField = async (req, res) => {
  try {
    const { userId } = req.params;
    const {
      latlng,
      cropName,
      variety,
      sowingDate,
      typeOfIrrigation,
      farmName,
      acre,
      typeOfFarming,
    } = req.body;

    /* ---------- Validation ---------- */
    if (
      !userId ||
      !latlng ||
      !cropName ||
      !variety ||
      !sowingDate ||
      !typeOfIrrigation ||
      !farmName ||
      !acre ||
      !typeOfFarming
    ) {
      return res.status(400).json({ message: "All fields are required" });
    }

    /* ---------- User check ---------- */
    const user = await User.findById(userId);
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    /* ---------- Create farm ---------- */
    const newFarmField = new FarmField({
      field: latlng,
      user: userId,
      cropName,
      variety,
      sowingDate,
      typeOfIrrigation,
      fieldName: farmName,
      acre,
      typeOfFarming,
    });

    const savedFarmField = await newFarmField.save();

    /* ---------- 🔔 Trigger advisory (NON-BLOCKING) ---------- */
    axios
      .post(
        `${process.env.ADVISORY_SERVER_URL}/api/advisory/internal/generate-advisory`,
        {
          farmFieldId: savedFarmField?._id,
          language: user.language || "en",
        },
      )
      .catch((err) => {
        console.error("Advisory trigger failed:", err);
      });

    /* ---------- Response ---------- */
    return res.status(201).json({
      success: true,
      message:
        "Farm field created successfully. Advisory will be generated shortly.",
      farmField: savedFarmField,
    });
  } catch (error) {
    console.error("Error adding farm field:", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

// Get all farm fields for a particular user
export const getField = async (req, res) => {
  try {
    const { userId } = req.params;

    /* ================= VALIDATION ================= */

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid User ID",
      });
    }

    const user = await User.findById(userId).select("_id");
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    /* ================= FETCH FIELDS ================= */

    const fields = await FarmField.find({ user: userId }).lean();

    if (!fields.length) {
      return res.status(200).json({
        message: "Farm fields retrieved successfully",
        farmFields: [],
      });
    }

    const fieldIds = fields.map((f) => f._id);

    /* ================= FETCH SUBSCRIPTIONS ================= */

    const subscriptions = await UserSubscription.find({
      userId,
      fieldId: { $in: fieldIds },
      status: { $in: ["active", "pending"] },
    })
      .populate("planId")
      .lean();

    /* ================= MAP LATEST SUB PER FIELD ================= */

    const subByFieldId = new Map();

    subscriptions.forEach((sub) => {
      const id = String(sub.fieldId);
      const existing = subByFieldId.get(id);

      if (!existing) {
        subByFieldId.set(id, sub);
      } else {
        const oldDate = existing.startDate || existing.createdAt || new Date(0);
        const newDate = sub.startDate || sub.createdAt || new Date(0);

        if (newDate > oldDate) {
          subByFieldId.set(id, sub);
        }
      }
    });

    /* ================= BUILD RESPONSE ================= */

    const now = new Date();

    const farmFields = fields.map((field) => {
      const sub = subByFieldId.get(String(field._id));

      if (!sub) {
        return {
          ...field,
          subscription: {
            hasActiveSubscription: false,
          },
        };
      }

      const plan = sub.planId;

      const isExpired =
        sub.endDate && new Date(sub.endDate) < now && sub.status === "active";

      const daysLeft =
        sub.endDate && sub.status === "active"
          ? Math.max(
              0,
              Math.ceil((new Date(sub.endDate) - now) / (1000 * 60 * 60 * 24)),
            )
          : 0;

      return {
        ...field,
        subscription: {
          hasActiveSubscription: sub.status === "active" && !isExpired,

          subscriptionId: sub._id,
          status: isExpired ? "expired" : sub.status,

          platform: sub.platform,
          billingCycle: sub.billingCycle,

          area: sub.area,
          unit: sub.unit,

          displayCurrency: sub.displayCurrency,
          pricePerUnitMinor: sub.pricePerUnitMinor,
          totalAmountMinor: sub.totalAmountMinor,
          chargedCurrency: sub.chargedCurrency,
          exchangeRate: sub.exchangeRate,

          startDate: sub.startDate,
          endDate: sub.endDate,
          daysLeft,

          razorpayOrderId: sub.razorpayOrderId,

          // Plan without pricing
          plan: plan
            ? {
                id: plan._id,
                name: plan.name,
                slug: plan.slug,
                description: plan.description,
                platform: plan.platform,
                isTrialEnabled: plan.isTrialEnabled,
                trialDays: plan.trialDays,
                features: plan.features,
                active: plan.active,
              }
            : null,
        },
      };
    });

    /* ================= RESPONSE ================= */

    return res.status(200).json({
      message: "Farm fields retrieved successfully",
      farmFields,
    });
  } catch (error) {
    console.error("Error fetching farm fields:", error);
    return res.status(500).json({
      message: "Server error",
      error: error.message,
    });
  }
};

// get all field
export const getAllField = async (req, res) => {
  try {
    const farms = await FarmField.find();

    // Check if there are users found
    if (!farms || farms.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No users found.",
      });
    }

    // Return the complete user data as-is
    res.status(200).json({
      success: true,
      message: "Farms fetched successfully.",
      farms: farms,
    });
  } catch (error) {
    console.error("Error fetching Farms:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch Farms.",
      error: error.message,
    });
  }
};

// Delete a specific farm field by its ID
export const deleteField = async (req, res) => {
  try {
    const farmFieldId = req.params.fieldId;

    if (!farmFieldId) {
      return res.status(400).json({ message: "Farm field ID is required" });
    }

    const deletedFarmField = await FarmField.findByIdAndDelete(farmFieldId);

    if (!deletedFarmField) {
      return res.status(404).json({ message: "Farm field not found" });
    }

    res.status(200).json({
      message: "Farm field deleted successfully",
      farmField: deletedFarmField,
      success: true,
    });
  } catch (error) {
    console.error("Error deleting farm field:", error);
    res
      .status(500)
      .json({ message: "Server error", error: error.message, success: false });
  }
};

// Update a specific farm field by its ID
export const updateField = async (req, res) => {
  const { fieldId } = req.params;
  const updateData = req.body;

  try {
    // Validate if fieldId is provided
    if (!fieldId) {
      return res
        .status(400)
        .json({ success: false, message: "Field ID is required." });
    }

    // Validate if update data is not empty
    if (!updateData || Object.keys(updateData).length === 0) {
      return res
        .status(400)
        .json({ success: false, message: "Update data cannot be empty." });
    }

    // Check if the field exists
    const fieldExists = await FarmField.findById(fieldId);
    if (!fieldExists) {
      return res
        .status(404)
        .json({ success: false, message: "Farm field not found." });
    }

    // Perform the update
    const updatedField = await FarmField.findByIdAndUpdate(
      fieldId,
      { $set: updateData },
      { new: true, runValidators: true },
    );

    // Respond with the updated field
    return res.status(200).json({
      success: true,
      message: "Farm field updated successfully.",
      farmField: updatedField,
    });
  } catch (error) {
    console.error("Error updating farm field:", error.message);
    // Handle specific Mongoose validation errors
    if (error.name === "ValidationError") {
      return res.status(400).json({
        success: false,
        message: "Validation error.",
        error: error.message,
      });
    }

    // Handle other server errors
    return res.status(500).json({
      success: false,
      message: "Server error occurred while updating the farm field.",
      error: error.message,
    });
  }
};
