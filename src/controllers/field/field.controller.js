import mongoose from "mongoose";
import FarmField from "../../models/field.model.js";
import User from "../../models/user.model.js";
import UserSubscription from "../../models/user-subscription.model.js";
import FieldCrop from "../../models/field-crop.model.js";
import { triggerInitialAdvisoryForNewField } from "../../features/advisory/services/triggerInitialAdvisory.service.js";
import MonitoringRequest from "../../models/monitoring-request.model.js";
import {
  createPrimaryFieldCrop,
  syncPrimaryFieldCrop,
} from "../../utils/crop/fieldCropSync.js";
import { getOrgScopedUserIds, sameOrg } from "../../utils/auth/orgScope.js";
function fieldAcreCount(field) {
  return Number(field?.acre) || 0;
}

function isFieldUnlocked(field, sub, hasActiveSubscription) {
  if (!hasActiveSubscription) return false;
  const covered = Number(sub?.area) || 0;
  const acres = fieldAcreCount(field);
  return acres <= 0 ? covered > 0 : covered >= acres;
}

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
      isBarrenLand,
    } = req.body;

    /* ---------- Validation ---------- */
    if (
      !userId ||
      !latlng ||
      !cropName ||
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

    if (req.user && !sameOrg(req.user, user.organization)) {
      return res.status(403).json({
        success: false,
        message: "You can only add farms in your organization.",
      });
    }

    /* ---------- Create farm ---------- */
    const newFarmField = new FarmField({
      field: latlng,
      user: userId,
      cropName,
      variety: typeof variety === "string" ? variety.trim() : "",
      sowingDate,
      typeOfIrrigation,
      fieldName: farmName,
      acre,
      typeOfFarming,
      isBarrenLand: Boolean(isBarrenLand),
    });

    const savedFarmField = await newFarmField.save();

    /* ---------- Multi-crop: mirror the legacy single-crop fields into the
       new FieldCrop collection (additive, non-breaking dual-write). A
       failure here must not fail farm creation itself. ---------- */
    try {
      await createPrimaryFieldCrop(savedFarmField);
    } catch (cropError) {
      console.error("Error creating primary FieldCrop for new field:", cropError);
    }

    /* ---------- Trigger first advisory (background; logs success/failure) ---------- */
    void triggerInitialAdvisoryForNewField(savedFarmField._id, {
      language: user.language || "en",
      userId,
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

// Get  farm fields for a particular user
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

    const user = await User.findById(userId).select("_id organization");
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    if (req.user && !sameOrg(req.user, user.organization)) {
      return res.status(403).json({
        success: false,
        message: "You can only view farms in your organization.",
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

    /* ================= FETCH CROPS (multi-crop) ================= */

    const crops = await FieldCrop.find({ farmField: { $in: fieldIds } })
      .sort({ isActive: -1, createdAt: -1 })
      .lean();

    const cropsByFieldId = new Map();
    crops.forEach((crop) => {
      const id = String(crop.farmField);
      if (!cropsByFieldId.has(id)) cropsByFieldId.set(id, []);
      cropsByFieldId.get(id).push(crop);
    });

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
      const crops = cropsByFieldId.get(String(field._id)) || [];

      if (!sub) {
        return {
          ...field,
          crops,
          isLocked: true,
          trialEligible: true,
          subscription: {
            hasActiveSubscription: false,
            status: "locked",
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

      const hasActiveSubscription = sub.status === "active" && !isExpired;

      return {
        ...field,
        crops,
        isLocked: !isFieldUnlocked(field, sub, hasActiveSubscription),
        trialEligible: true,
        subscription: {
          hasActiveSubscription,

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

          activationSource: sub.activationSource || "razorpay",
          cardAcres: Number(sub.cardAcres) || 0,
          paidAcres: Number(sub.paidAcres) || 0,
          pendingAdminAcres: Number(sub.pendingAdminAcres) || 0,
          subscriptionPhase: sub.subscriptionPhase || null,

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
    const { page = 1, limit = 10, all = "false" } = req.query;

    const wantsAll = String(all).toLowerCase() === "true";
    const parsedLimit = Math.max(1, parseInt(limit, 10) || 10);
    const parsedPage = Math.max(1, parseInt(page, 10) || 1);

    const scopedUserIds = await getOrgScopedUserIds(req.user);
    const farmQuery =
      scopedUserIds == null ? {} : { user: { $in: scopedUserIds } };

    let farms;
    let totalFarms;

    if (wantsAll) {
      farms = await FarmField.find(farmQuery)
        .sort({ createdAt: -1 })
        .populate({
          path: "user",
          select: "firstName lastName email phone avatar role clientSource language createdAt",
        })
        .lean();
      totalFarms = farms.length;
    } else {
      const skip = (parsedPage - 1) * parsedLimit;

      [farms, totalFarms] = await Promise.all([
        FarmField.find(farmQuery)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(parsedLimit)
          .populate({
            path: "user",
            select: "firstName lastName email phone avatar role clientSource language createdAt",
          })
          .lean(),
        FarmField.countDocuments(farmQuery),
      ]);
    }

    if (!farms || farms.length === 0) {
      return res.status(200).json({
        success: true,
        message: "No farms found.",
        farms: [],
        pagination: wantsAll
          ? { returned: 0, totalFarms: 0 }
          : { currentPage: parsedPage, totalPages: 1, totalFarms: 0, limit: parsedLimit },
      });
    }

    /* ================= FETCH CROPS (multi-crop) ================= */

    const farmIds = farms.map((f) => f._id);
    const crops = await FieldCrop.find({ farmField: { $in: farmIds } })
      .sort({ isActive: -1, createdAt: -1 })
      .lean();

    const cropsByFieldId = new Map();
    crops.forEach((crop) => {
      const id = String(crop.farmField);
      if (!cropsByFieldId.has(id)) cropsByFieldId.set(id, []);
      cropsByFieldId.get(id).push(crop);
    });

    const farmsWithCrops = farms.map((farm) => ({
      ...farm,
      crops: cropsByFieldId.get(String(farm._id)) || [],
    }));

    return res.status(200).json({
      success: true,
      message: "Farms fetched successfully.",
      farms: farmsWithCrops,
      pagination: wantsAll
        ? { returned: farms.length, totalFarms }
        : {
            currentPage: parsedPage,
            totalPages: Math.ceil(totalFarms / parsedLimit),
            totalFarms,
            limit: parsedLimit,
          },
    });
  } catch (error) {
    console.error("Error fetching farms:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch farms.",
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

    const farmField = await FarmField.findById(farmFieldId);
    if (!farmField) {
      return res.status(404).json({ message: "Farm field not found" });
    }

    const owner = await User.findById(farmField.user).select("organization");
    if (req.user && !sameOrg(req.user, owner?.organization)) {
      return res.status(403).json({
        success: false,
        message: "You can only delete farms in your organization.",
      });
    }

    const deletedFarmField = await FarmField.findByIdAndDelete(farmFieldId);

    // Multi-crop: a deleted farm shouldn't leave orphaned crop instances behind.
    try {
      await FieldCrop.deleteMany({ farmField: farmFieldId });
    } catch (cropError) {
      console.error("Error deleting crops for removed field:", cropError);
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
  const body = req.body || {};

  const ALLOWED = [
    "fieldName",
    "cropName",
    "variety",
    "sowingDate",
    "acre",
    "typeOfIrrigation",
    "typeOfFarming",
    "isBarrenLand",
    "field",
  ];

  try {
    if (!fieldId) {
      return res
        .status(400)
        .json({ success: false, message: "Field ID is required." });
    }

    const updateData = {};
    for (const key of ALLOWED) {
      if (Object.prototype.hasOwnProperty.call(body, key)) {
        updateData[key] = body[key];
      }
    }
    if (
      updateData.typeOfFarming == null &&
      body.farmingType != null &&
      body.farmingType !== "N/A"
    ) {
      updateData.typeOfFarming = body.farmingType;
    }

    if (Object.keys(updateData).length === 0) {
      return res
        .status(400)
        .json({ success: false, message: "Update data cannot be empty." });
    }

    const fieldExists = await FarmField.findById(fieldId);
    if (!fieldExists) {
      return res
        .status(404)
        .json({ success: false, message: "Farm field not found." });
    }

    const owner = await User.findById(fieldExists.user).select("organization");
    if (req.user && !sameOrg(req.user, owner?.organization)) {
      return res.status(403).json({
        success: false,
        message: "You can only update farms in your organization.",
      });
    }

    const updatedField = await FarmField.findByIdAndUpdate(
      fieldId,
      { $set: updateData },
      { new: true, runValidators: true },
    );

    /* ---------- Multi-crop: keep the primary FieldCrop in sync with the
       legacy flat-field update (additive, non-breaking). ---------- */
    try {
      await syncPrimaryFieldCrop(fieldExists, updateData);
    } catch (cropError) {
      console.error("Error syncing primary FieldCrop on field update:", cropError);
    }

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

// Request monitoring for LFP app (sends WhatsApp alert to ops number)
export const requestFieldMonitoring = async (req, res) => {
  try {
    const { userId } = req.params;
    const { fieldId, clientApp } = req.body || {};
    if (clientApp !== "lfp-app") {
      return res.status(403).json({
        success: false,
        message: "This endpoint is only available for LFP app",
      });
    }


    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid user id",
      });
    }

    if (!fieldId || !mongoose.Types.ObjectId.isValid(fieldId)) {
      return res.status(400).json({
        success: false,
        message: "Valid fieldId is required",
      });
    }

    const user = await User.findById(userId).lean();
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const allFields = await FarmField.find({ user: userId }).lean();
    const selectedField = allFields.find((f) => String(f._id) === String(fieldId));

    if (!selectedField) {
      return res
        .status(404)
        .json({ success: false, message: "Selected farm field not found" });
    }

    const farmerName =
      [user.firstName, user.lastName].filter(Boolean).join(" ").trim() || "Unknown";
    const farmerPhone = user.phone || "";
    const farmerEmail = user.email || "";

    const toFarmStatus = (farm) => (farm?.isBarrenLand ? "barren" : "crop_in_field");

    const monitoringRequest = await MonitoringRequest.create({
      userId,
      fieldId,
      clientApp: "lfp-app",
      requestStatus: "pending",
      requestedFieldSnapshot: {
        fieldName: selectedField.fieldName || "",
        cropName: selectedField.cropName || "",
        variety: selectedField.variety || "",
        acre: Number(selectedField.acre || 0),
        typeOfIrrigation: selectedField.typeOfIrrigation || "",
        typeOfFarming: selectedField.typeOfFarming || "",
        sowingDate: selectedField.sowingDate || "",
        isBarrenLand: Boolean(selectedField.isBarrenLand),
        farmStatus: toFarmStatus(selectedField),
      },
      allFarmsSnapshot: allFields.map((farm) => ({
        fieldId: farm._id,
        fieldName: farm.fieldName || "",
        cropName: farm.cropName || "",
        acre: Number(farm.acre || 0),
        sowingDate: farm.sowingDate || "",
        isBarrenLand: Boolean(farm.isBarrenLand),
        farmStatus: toFarmStatus(farm),
      })),
      farmerSnapshot: {
        name: farmerName,
        phone: farmerPhone,
        email: farmerEmail,
      },
    });

    return res.status(200).json({
      success: true,
      message: "Monitoring request submitted successfully",
      data: {
        userId,
        fieldId,
        requestId: monitoringRequest._id,
        requestStatus: monitoringRequest.requestStatus,
      },
    });
  } catch (error) {
    console.error("Error requesting monitoring:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while requesting monitoring",
      error: error.message,
    });
  }
};

export const getMonitoringRequests = async (req, res) => {
  try {
    const { userId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid user id",
      });
    }

    const requests = await MonitoringRequest.find({ userId })
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json({
      success: true,
      message: "Monitoring requests fetched successfully",
      requests,
    });
  } catch (error) {
    console.error("Error fetching monitoring requests:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while fetching monitoring requests",
      error: error.message,
    });
  }
};
