import mongoose from "mongoose";
import {
  getFarmerCarbonProfile,
  getFieldCarbonHistory,
  getAdminFarms,
  getAdminFarmers,
  getAdminOrganizations,
  getPlatformTotal,
} from "../../services/carbonTracking.service.js";

/**
 * GET /api/carbon/profile/:userId
 * Get carbon credit profile for a farmer (all fields combined).
 */
export const getFarmerCarbonProfileHandler = async (req, res) => {
  try {
    const { userId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid user ID",
      });
    }

    const profile = await getFarmerCarbonProfile(userId);

    return res.status(200).json({
      success: true,
      data: profile,
    });
  } catch (error) {
    console.error("Carbon profile fetch error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch carbon profile",
    });
  }
};

/**
 * GET /api/carbon/field/:farmFieldId/history
 * Get carbon history for a specific field.
 */
export const getFieldCarbonHistoryHandler = async (req, res) => {
  try {
    const { farmFieldId } = req.params;
    const { limit = 90, startDate, endDate } = req.query;

    if (!mongoose.Types.ObjectId.isValid(farmFieldId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid farm field ID",
      });
    }

    const records = await getFieldCarbonHistory(farmFieldId, {
      limit: Number(limit),
      startDate: startDate || undefined,
      endDate: endDate || undefined,
    });

    return res.status(200).json({
      success: true,
      data: records,
    });
  } catch (error) {
    console.error("Carbon history fetch error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch carbon history",
    });
  }
};

/* =========================================================
   ADMIN APIs
========================================================= */

/**
 * GET /api/carbon/admin/farms
 * Paginated farm carbon data.
 */
export const getAdminFarmsHandler = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      organizationId,
      startDate,
      endDate,
      search,
      crop,
      sortBy,
      sortOrder,
    } = req.query;

    const result = await getAdminFarms({
      page: Number(page),
      limit: Number(limit),
      organizationId: organizationId || undefined,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      search: search || undefined,
      crop: crop || undefined,
      sortBy: sortBy || undefined,
      sortOrder: sortOrder || undefined,
    });

    return res.status(200).json({
      success: true,
      data: result.data,
      pagination: result.pagination,
    });
  } catch (error) {
    console.error("Admin farms carbon error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch farm carbon data",
    });
  }
};

/**
 * GET /api/carbon/admin/farmers
 * Paginated farmer carbon data.
 */
export const getAdminFarmersHandler = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      organizationId,
      startDate,
      endDate,
      role,
      sortBy,
      sortOrder,
    } = req.query;

    const result = await getAdminFarmers({
      page: Number(page),
      limit: Number(limit),
      organizationId: organizationId || undefined,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      role: role || undefined,
      sortBy: sortBy || undefined,
      sortOrder: sortOrder || undefined,
    });

    return res.status(200).json({
      success: true,
      data: result.data,
      pagination: result.pagination,
    });
  } catch (error) {
    console.error("Admin farmers carbon error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch farmer carbon data",
    });
  }
};

/**
 * GET /api/carbon/admin/organizations
 * Organization carbon totals.
 */
export const getAdminOrganizationsHandler = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    const result = await getAdminOrganizations({
      startDate: startDate || undefined,
      endDate: endDate || undefined,
    });

    return res.status(200).json({
      success: true,
      data: result.data,
    });
  } catch (error) {
    console.error("Admin organizations carbon error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch organization carbon data",
    });
  }
};

/**
 * GET /api/carbon/admin/platform-total
 * Platform-wide carbon totals.
 */
export const getPlatformTotalHandler = async (req, res) => {
  try {
    const { startDate, endDate, includeMonthly } = req.query;

    const result = await getPlatformTotal({
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      includeMonthly: includeMonthly !== "false",
    });

    return res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error("Platform total carbon error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch platform carbon total",
    });
  }
};
