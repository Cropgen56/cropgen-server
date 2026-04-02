import mongoose from "mongoose";
import FarmAdvisory from "../models/farmadvisory.model.js";
import FarmField from "../models/field.model.js";
import { resolveAOIForFarm } from "../utils/weather/weather.utils.js";
import { generateAdvisoryForField } from "../services/advisory.services.js";
import Notification from "../models/notification.model.js";

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
      query.targetDate = {};
      if (from) query.targetDate.$gte = new Date(from);
      if (to) query.targetDate.$lte = new Date(to);
    }

    let advisoryQuery = FarmAdvisory.find(query)
      .populate("farmFieldId", "fieldName cropName variety sowingDate")
      .sort({ targetDate: -1 })
      .lean();

    if (latest === "true") {
      const advisories = await advisoryQuery.limit(1);
      const advisoryIds = advisories.map((a) => a._id);
      const notifications = await Notification.find({
        referenceId: { $in: advisoryIds },
        type: "ADVISORY",
      }).lean();
      const notificationMap = {};
      notifications.forEach((n) => {
        notificationMap[n.referenceId.toString()] = n;
      });
      const advisoriesWithNotification = advisories.map((advisory) => ({
        ...advisory,
        notification: notificationMap[advisory._id.toString()] || null,
      }));

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

    const advisoriesWithNotification = advisories.map((advisory) => ({
      ...advisory,
      notification: notificationMap[advisory._id.toString()] || null,
    }));

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

    await generateAdvisoryForField(farm._id, aoiId, advisoryLanguage, platform || "whatsapp");

    res.json({ success: true });
  } catch (err) {
    console.error("Advisory API failed", err);
    res.status(500).json({ message: "Advisory generation failed" });
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

    return res.status(200).json({
      success: true,
      page,
      limit,
      data,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to fetch advisories",
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

    const data = advisories.map((advisory) => ({
      ...advisory,
      notification: notificationMap[advisory._id.toString()] || null,
    }));

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
