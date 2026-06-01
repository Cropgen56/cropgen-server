import mongoose from "mongoose";
import FarmAdvisory from "../models/farmAdvisory.model.js";
import FarmField from "../../../models/field.model.js";
import { resolveAOIForFarm } from "../../../utils/weather/weather.utils.js";
import { generateAdvisoryForField } from "../services/advisory.service.js";
import { updateAdvisoryActivityProgress } from "../services/updateAdvisoryActivityProgress.service.js";
import { ensureAdvisoryOperationsSynced } from "../services/syncAdvisoryToOperations.service.js";
import Notification from "../../../models/notification.model.js";
import {
  enrichAdvisoryForClient,
  enrichAdvisoriesForClient,
} from "../utils/enrichAdvisoryForClient.js";

function resolveResponseLanguage(req) {
  return req.query.language || req.user?.language || "en";
}

export const getFarmAdvisories = async (req, res) => {
  try {
    const { farmFieldId } = req.params;
    const { page = 1, limit = 10, latest = "false", from, to } = req.query;

    if (!mongoose.Types.ObjectId.isValid(farmFieldId)) {
      return res.status(400).json({
        status: "error",
        message: "Invalid farmFieldId.",
        advisories: [],
      });
    }

    const fieldExists = await FarmField.exists({ _id: farmFieldId });
    if (!fieldExists) {
      return res.status(404).json({
        status: "error",
        message: "Farm field not found.",
        advisories: [],
      });
    }

    const query = { farmFieldId };

    if (from || to) {
      query.createdAt = {};
      if (from) query.createdAt.$gte = new Date(from);
      if (to) query.createdAt.$lte = new Date(to);
    }

    let advisoryQuery = FarmAdvisory.find(query)
      .populate("farmFieldId", "fieldName cropName variety sowingDate")
      .sort({ createdAt: -1 })
      .lean();

    if (latest === "true") {
      const advisories = await advisoryQuery.limit(1);

      if (advisories.length) {
        const latest = advisories[0];
        try {
          await ensureAdvisoryOperationsSynced({
            farmFieldId: latest.farmFieldId,
            advisoryId: latest._id,
            activitiesToDo: latest.activitiesToDo,
          });
        } catch (syncErr) {
          console.error("ensureAdvisoryOperationsSynced:", syncErr.message);
        }
      }

      const advisoryIds = advisories.map((a) => a._id);
      const notifications = await Notification.find({
        referenceId: { $in: advisoryIds },
        type: "ADVISORY",
      }).lean();
      const notificationMap = {};
      notifications.forEach((n) => {
        notificationMap[n.referenceId.toString()] = n;
      });
      const advisoriesWithNotification = enrichAdvisoriesForClient(
        advisories.map((advisory) => ({
          ...advisory,
          notification: notificationMap[advisory._id.toString()] || null,
        })),
        { language: resolveResponseLanguage(req) },
      );

      return res.status(200).json({
        status: "ok",
        message: advisories.length
          ? "Latest advisory fetched successfully."
          : "No advisory available.",
        advisories: advisoriesWithNotification,
      });
    }

    const skip = (Number(page) - 1) * Number(limit);
    advisoryQuery = advisoryQuery.skip(skip).limit(Number(limit));

    const [advisories, total] = await Promise.all([
      advisoryQuery,
      FarmAdvisory.countDocuments(query),
    ]);

    const advisoryIds = advisories.map((a) => a._id);
    const notifications = await Notification.find({
      referenceId: { $in: advisoryIds },
      type: "ADVISORY",
    }).lean();

    const notificationMap = {};
    notifications.forEach((n) => {
      notificationMap[n.referenceId.toString()] = n;
    });

    const advisoriesWithNotification = enrichAdvisoriesForClient(
      advisories.map((advisory) => ({
        ...advisory,
        notification: notificationMap[advisory._id.toString()] || null,
      })),
      { language: resolveResponseLanguage(req) },
    );

    return res.status(200).json({
      status: "ok",
      message: advisories.length
        ? "Advisories fetched successfully."
        : "No advisory available.",
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        totalPages: Math.ceil(total / limit),
      },
      advisories: advisoriesWithNotification,
    });
  } catch (error) {
    console.error("Advisory fetch error:", error);
    return res.status(500).json({
      status: "error",
      message: "Internal server error.",
      advisories: [],
    });
  }
};

export const getLatestNpkBreakdown = async (req, res) => {
  try {
    const { farmFieldId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(farmFieldId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid farmFieldId.",
      });
    }

    const advisory = await FarmAdvisory.findOne({ farmFieldId })
      .sort({ createdAt: -1 })
      .select("farmFieldId plantGrowthActivity npkManagement createdAt")
      .populate("farmFieldId", "fieldName cropName variety sowingDate acre")
      .lean();

    if (!advisory) {
      return res.status(404).json({
        success: false,
        message: "No advisory found for this farm field.",
      });
    }

    const reqNpk = advisory?.npkManagement?.required ?? {};
    const availNpk = advisory?.npkManagement?.available ?? {};

    const nRequired = Number(reqNpk.nitrogenKgPerHa) || 0;
    const pRequired = Number(reqNpk.phosphorousKgPerHa) || 0;
    const kRequired = Number(reqNpk.potassiumKgPerHa) || 0;

    const nAvailable = Number(availNpk.nitrogenKgPerHa) || 0;
    const pAvailable = Number(availNpk.phosphorousKgPerHa) || 0;
    const kAvailable = Number(availNpk.potassiumKgPerHa) || 0;

    const response = {
      farmField: advisory.farmFieldId,
      advisoryId: advisory._id,
      generatedAt: advisory.createdAt,
      stage: advisory?.plantGrowthActivity ?? null,
      npkBreakdown: {
        nitrogen: {
          unit: "kg/ha",
          required: nRequired,
          available: nAvailable,
          deficit: Math.max(0, Number((nRequired - nAvailable).toFixed(1))),
        },
        phosphorous: {
          unit: "kg/ha",
          required: pRequired,
          available: pAvailable,
          deficit: Math.max(0, Number((pRequired - pAvailable).toFixed(1))),
        },
        potassium: {
          unit: "kg/ha",
          required: kRequired,
          available: kAvailable,
          deficit: Math.max(0, Number((kRequired - kAvailable).toFixed(1))),
        },
      },
      totals: {
        unit: "kg/ha",
        required: Number((nRequired + pRequired + kRequired).toFixed(1)),
        available: Number((nAvailable + pAvailable + kAvailable).toFixed(1)),
        deficit: Number(
          (
            Math.max(0, nRequired - nAvailable) +
            Math.max(0, pRequired - pAvailable) +
            Math.max(0, kRequired - kAvailable)
          ).toFixed(1),
        ),
      },
    };

    const language = resolveResponseLanguage(req);
    const enriched = enrichAdvisoryForClient(advisory, {
      language,
      farmField: advisory.farmFieldId,
    });

    return res.status(200).json({
      success: true,
      message: "Latest NPK breakdown fetched successfully.",
      data: {
        ...response,
        stage: enriched.plantGrowthActivity ?? response.stage,
        cropStage: enriched.cropStage ?? null,
        npkDisplay: enriched.npkManagement?.display ?? null,
      },
    });
  } catch (error) {
    console.error("Latest NPK breakdown fetch error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch latest NPK breakdown.",
    });
  }
};

export const patchAdvisoryActivityProgress = async (req, res) => {
  try {
    const { advisoryId, activityType } = req.params;
    const { progress } = req.body;

    if (!mongoose.Types.ObjectId.isValid(advisoryId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid advisory ID",
      });
    }

    if (!progress) {
      return res.status(400).json({
        success: false,
        message: "progress is required",
      });
    }

    const advisory = await updateAdvisoryActivityProgress({
      advisoryId,
      activityType: activityType.toUpperCase(),
      progress,
    });

    const doc =
      typeof advisory.toObject === "function" ? advisory.toObject() : advisory;

    return res.status(200).json({
      success: true,
      message: "Activity progress updated",
      advisory: enrichAdvisoryForClient(doc, {
        language: resolveResponseLanguage(req),
      }),
    });
  } catch (error) {
    const status =
      error.message === "Advisory not found" ||
      error.message === "Activity not found on this advisory"
        ? 404
        : error.message === "Invalid progress value" ||
            error.message === "Invalid activity type"
          ? 400
          : 500;
    return res.status(status).json({
      success: false,
      message: error.message || "Failed to update activity progress",
    });
  }
};

export const generateFarmAdvisory = async (req, res) => {
  try {
    const { farmFieldId, language, platform } = req.body;

    if (!farmFieldId) {
      return res.status(400).json({ message: "farmFieldId required" });
    }

    const farm = await FarmField.findById(farmFieldId).populate("user", "language");
    if (!farm) {
      return res.status(404).json({ message: "Farm not found" });
    }

    const { aoiId } = await resolveAOIForFarm(farm);
    const advisoryLanguage = language || farm.user?.language || "en";

    const advisory = await generateAdvisoryForField(
      farm._id,
      aoiId,
      advisoryLanguage,
      platform || "whatsapp",
    );
    res.json({
      success: true,
      advisoryId: String(advisory._id),
      activitiesSource: advisory.activitiesSource,
      activitiesCount: (advisory.activitiesToDo || []).length,
    });
  } catch (err) {
    console.error("Advisory API failed", err);
    res.status(500).json({
      message: "Advisory generation failed",
      error: process.env.NODE_ENV === "development" ? err.message : undefined,
    });
  }
};

export const getFarmAdvisoriesByUser = async (req, res) => {
  try {
    const { userId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid user ID" });
    }

    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit) || 10, 100);
    const skip = (page - 1) * limit;

    const pipeline = [
      {
        $lookup: {
          from: "farmfields",
          localField: "farmFieldId",
          foreignField: "_id",
          as: "farmField",
        },
      },
      { $unwind: "$farmField" },
      {
        $match: {
          "farmField.user": new mongoose.Types.ObjectId(userId),
        },
      },
      { $sort: { createdAt: -1 } },
      { $skip: skip },
      { $limit: limit },
      {
        $project: {
          activitiesToDo: 1,
          cropHealth: 1,
          yield: 1,
          plantGrowthActivity: 1,
          npkManagement: 1,
          whatsappNotification: 1,
          createdAt: 1,
          farmField: {
            fieldName: 1,
            cropName: 1,
            variety: 1,
            sowingDate: 1,
          },
        },
      },
    ];

    const data = await FarmAdvisory.aggregate(pipeline);
    const language = resolveResponseLanguage(req);

    return res.status(200).json({
      success: true,
      page,
      limit,
      data: enrichAdvisoriesForClient(data, { language }),
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to fetch advisories",
    });
  }
};

export const getFarmersWithAdvisories = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);
    const skip = (page - 1) * limit;
    const search = (req.query.search || "").trim();

    const pipeline = [
      {
        $lookup: {
          from: "farmfields",
          localField: "farmFieldId",
          foreignField: "_id",
          as: "farmField",
        },
      },
      { $unwind: "$farmField" },
      {
        $group: {
          _id: "$farmField.user",
          advisoryCount: { $sum: 1 },
          farmIds: { $addToSet: "$farmFieldId" },
          latestAdvisoryAt: { $max: "$createdAt" },
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "_id",
          foreignField: "_id",
          as: "farmer",
        },
      },
      { $unwind: "$farmer" },
    ];

    if (search) {
      const regex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      pipeline.push({
        $match: {
          $or: [
            { "farmer.firstName": regex },
            { "farmer.lastName": regex },
            { "farmer.email": regex },
            { "farmer.phone": regex },
          ],
        },
      });
    }

    pipeline.push(
      { $sort: { latestAdvisoryAt: -1 } },
      {
        $facet: {
          data: [
            { $skip: skip },
            { $limit: limit },
            {
              $project: {
                _id: 0,
                farmerId: "$_id",
                firstName: "$farmer.firstName",
                lastName: "$farmer.lastName",
                email: "$farmer.email",
                avatar: "$farmer.avatar",
                phone: "$farmer.phone",
                advisoryCount: 1,
                farmCount: { $size: "$farmIds" },
                latestAdvisoryAt: 1,
              },
            },
          ],
          total: [{ $count: "count" }],
        },
      },
    );

    const [result] = await FarmAdvisory.aggregate(pipeline);
    const data = result?.data ?? [];
    const total = result?.total?.[0]?.count ?? 0;

    return res.status(200).json({
      success: true,
      data,
      pagination: {
        totalRecords: total,
        totalPages: Math.ceil(total / limit) || 1,
        currentPage: page,
        perPage: limit,
      },
    });
  } catch (error) {
    console.error("Get farmers with advisories error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch farmers with advisories",
    });
  }
};

export const getAdvisoryById = async (req, res) => {
  try {
    const { advisoryId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(advisoryId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid advisory ID",
      });
    }

    const advisory = await FarmAdvisory.findById(advisoryId)
      .populate({
        path: "farmFieldId",
        select: "fieldName cropName variety sowingDate acre user",
        populate: {
          path: "user",
          select: "firstName lastName email phone",
        },
      })
      .lean();

    if (!advisory) {
      return res.status(404).json({
        success: false,
        message: "Advisory not found",
      });
    }

    const notification = await Notification.findOne({
      referenceId: advisory._id,
      type: "ADVISORY",
    }).lean();

    return res.status(200).json({
      success: true,
      data: enrichAdvisoryForClient(
        {
          ...advisory,
          notification: notification || null,
        },
        { language: resolveResponseLanguage(req) },
      ),
    });
  } catch (error) {
    console.error("Get advisory by ID error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch advisory",
    });
  }
};

export const getAllFarmAdvisories = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const skip = (page - 1) * limit;

    const [advisories, total] = await Promise.all([
      FarmAdvisory.find({})
        .populate({
          path: "farmFieldId",
          select: "fieldName cropName variety sowingDate acre user",
          populate: {
            path: "user",
            select: "firstName lastName email phone",
          },
        })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),

      FarmAdvisory.countDocuments({}),
    ]);

    const advisoryIds = advisories.map((a) => a._id);

    const notifications = await Notification.find({
      referenceId: { $in: advisoryIds },
      type: "ADVISORY",
    }).lean();

    const notificationMap = {};

    notifications.forEach((n) => {
      notificationMap[n.referenceId.toString()] = n;
    });

    const data = enrichAdvisoriesForClient(
      advisories.map((advisory) => ({
        ...advisory,
        notification: notificationMap[advisory._id.toString()] || null,
      })),
      { language: resolveResponseLanguage(req) },
    );

    return res.status(200).json({
      success: true,
      pagination: {
        totalRecords: total,
        totalPages: Math.ceil(total / limit),
        currentPage: page,
        perPage: limit,
        hasNextPage: page * limit < total,
        hasPrevPage: page > 1,
      },
      data,
    });
  } catch (error) {
    console.error("Get All Farm Advisories Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch farm advisories",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};
