import mongoose from "mongoose";
import FarmCarbonRecord from "../models/farm-carbon-record.model.js";
import FarmCarbonProfile from "../models/farm-carbon-profile.model.js";
import FieldCrop from "../models/field-crop.model.js";
import User from "../models/user.model.js";

export async function saveCarbonFromAdvisory({
  userId,
  farmFieldId,
  cropInstanceId = null,
  advisoryId,
  date,
  carbonData,
}) {
  if (!carbonData || userId == null || farmFieldId == null) return;

  const emission = carbonData.emissionKgCO2 ?? 0;
  const captured = carbonData.capturedKgCO2 ?? 0;
  const netBalance = carbonData.netBalanceKgCO2 ?? 0;

  // Multi-crop: keyed by (farmFieldId, cropInstanceId, date) — a farm with
  // several active crops writes one record per crop per day instead of one
  // crop's numbers silently overwriting another's.
  await FarmCarbonRecord.findOneAndUpdate(
    { farmFieldId, cropInstanceId: cropInstanceId || null, date },
    {
      userId,
      farmFieldId,
      cropInstanceId: cropInstanceId || null,
      advisoryId,
      date,
      emissionKgCO2: emission,
      capturedKgCO2: captured,
      netBalanceKgCO2: netBalance,
    },
    { upsert: true, new: true }
  );

  const profile = await FarmCarbonProfile.findOneAndUpdate(
    { userId, farmFieldId },
    {
      $inc: {
        cumulativeEmissionKgCO2: emission,
        cumulativeCapturedKgCO2: captured,
        cumulativeNetBalanceKgCO2: netBalance,
        recordCount: 1,
      },
      $set: { lastAdvisoryDate: date },
    },
    { upsert: true, new: true }
  );

  return profile;
}

export async function getFarmerCarbonProfile(userId) {
  const profiles = await FarmCarbonProfile.find({ userId })
    .populate("farmFieldId", "fieldName cropName acre")
    .lean();

  // Multi-crop: show every currently-active crop name on the farm, not just
  // the legacy singular field.
  const farmFieldIds = profiles
    .map((p) => p.farmFieldId?._id ?? p.farmFieldId)
    .filter(Boolean);
  const activeCrops = farmFieldIds.length
    ? await FieldCrop.find({
        farmField: { $in: farmFieldIds },
        isActive: true,
      })
        .select("farmField cropName")
        .lean()
    : [];
  const cropNamesByFarmId = new Map();
  activeCrops.forEach((c) => {
    const key = String(c.farmField);
    if (!cropNamesByFarmId.has(key)) cropNamesByFarmId.set(key, []);
    cropNamesByFarmId.get(key).push(c.cropName);
  });

  const byField = profiles.map((p) => {
    const fieldId = p.farmFieldId?._id ?? p.farmFieldId;
    const activeCropNames = cropNamesByFarmId.get(String(fieldId));
    return {
      farmFieldId: fieldId,
      fieldName: p.farmFieldId?.fieldName,
      cropName:
        activeCropNames?.join(" + ") || p.farmFieldId?.cropName || null,
      acre: p.farmFieldId?.acre,
      cumulativeEmissionKgCO2: p.cumulativeEmissionKgCO2,
      cumulativeCapturedKgCO2: p.cumulativeCapturedKgCO2,
      cumulativeNetBalanceKgCO2: p.cumulativeNetBalanceKgCO2,
      recordCount: p.recordCount,
      lastAdvisoryDate: p.lastAdvisoryDate,
    };
  });

  const totalEmission = byField.reduce((s, f) => s + (f.cumulativeEmissionKgCO2 ?? 0), 0);
  const totalCaptured = byField.reduce((s, f) => s + (f.cumulativeCapturedKgCO2 ?? 0), 0);
  const totalNetBalance = byField.reduce((s, f) => s + (f.cumulativeNetBalanceKgCO2 ?? 0), 0);

  return {
    userId,
    totalEmissionKgCO2: Math.round(totalEmission * 10) / 10,
    totalCapturedKgCO2: Math.round(totalCaptured * 10) / 10,
    totalNetBalanceKgCO2: Math.round(totalNetBalance * 10) / 10,
    byField,
  };
}

export async function getFieldCarbonHistory(farmFieldId, options = {}) {
  const { limit = 90, startDate, endDate } = options;
  const query = { farmFieldId };

  if (startDate) query.date = { ...query.date, $gte: startDate };
  if (endDate) query.date = { ...query.date, $lte: endDate };

  const records = await FarmCarbonRecord.find(query)
    .sort({ date: -1 })
    .limit(limit)
    .lean();

  return records;
}

export async function getAdminFarms(options = {}) {
  const {
    page = 1,
    limit = 20,
    organizationId,
    startDate,
    endDate,
    search,
    crop,
    sortBy = "lastAdvisoryDate",
    sortOrder = "desc",
  } = options;

  const match = {};

  if (organizationId) {
    const farmersInOrg = await User.find({ organization: organizationId })
      .select("_id")
      .lean();
    const userIds = farmersInOrg.map((u) => u._id);
    match.userId = { $in: userIds };
  }

  if (startDate || endDate) {
    match.lastAdvisoryDate = {};
    if (startDate) match.lastAdvisoryDate.$gte = startDate;
    if (endDate) match.lastAdvisoryDate.$lte = endDate;
  }

  const pipeline = [
    { $match: Object.keys(match).length ? match : {} },
    {
      $lookup: {
        from: "farmfields",
        localField: "farmFieldId",
        foreignField: "_id",
        as: "farmField",
      },
    },
    { $unwind: { path: "$farmField", preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: "users",
        localField: "userId",
        foreignField: "_id",
        as: "user",
      },
    },
    { $unwind: { path: "$user", preserveNullAndEmptyArrays: true } },
  ];

  if (search) {
    pipeline.push({
      $match: {
        $or: [
          { "farmField.fieldName": { $regex: search, $options: "i" } },
          { "user.firstName": { $regex: search, $options: "i" } },
          { "user.lastName": { $regex: search, $options: "i" } },
          { "user.phone": { $regex: search, $options: "i" } },
        ],
      },
    });
  }

  if (crop) {
    pipeline.push({
      $match: { "farmField.cropName": { $regex: crop, $options: "i" } },
    });
  }

  const sortField =
    sortBy === "netBalance"
      ? "cumulativeNetBalanceKgCO2"
      : sortBy === "emission"
        ? "cumulativeEmissionKgCO2"
        : "lastAdvisoryDate";
  const sortDir = sortOrder === "asc" ? 1 : -1;

  const countPipeline = [...pipeline, { $count: "total" }];
  const [countResult] = await FarmCarbonProfile.aggregate(countPipeline);
  const total = countResult?.total ?? 0;

  pipeline.push(
    { $sort: { [sortField]: sortDir } },
    { $skip: (page - 1) * limit },
    { $limit: limit },
    {
      $project: {
        farmFieldId: 1,
        userId: 1,
        fieldName: "$farmField.fieldName",
        cropName: "$farmField.cropName",
        acre: "$farmField.acre",
        farmerName: {
          $concat: [
            { $ifNull: ["$user.firstName", ""] },
            " ",
            { $ifNull: ["$user.lastName", ""] },
          ],
        },
        farmerPhone: "$user.phone",
        cumulativeEmissionKgCO2: 1,
        cumulativeCapturedKgCO2: 1,
        cumulativeNetBalanceKgCO2: 1,
        recordCount: 1,
        lastAdvisoryDate: 1,
      },
    }
  );

  const data = await FarmCarbonProfile.aggregate(pipeline);

  const formatted = data.map((d) => ({
    farmFieldId: d.farmFieldId,
    userId: d.userId,
    fieldName: d.fieldName?.trim() || "—",
    cropName: d.cropName || "—",
    acre: d.acre ?? 0,
    farmerName: d.farmerName?.trim() || "—",
    farmerPhone: d.farmerPhone || "—",
    cumulativeEmissionKgCO2: Math.round((d.cumulativeEmissionKgCO2 ?? 0) * 100) / 100,
    cumulativeCapturedKgCO2: Math.round((d.cumulativeCapturedKgCO2 ?? 0) * 100) / 100,
    cumulativeNetBalanceKgCO2: Math.round((d.cumulativeNetBalanceKgCO2 ?? 0) * 100) / 100,
    recordCount: d.recordCount ?? 0,
    lastAdvisoryDate: d.lastAdvisoryDate,
  }));

  return {
    data: formatted,
    pagination: {
      total,
      page: Number(page),
      limit: Number(limit),
      totalPages: Math.ceil(total / limit),
    },
  };
}

export async function getAdminFarmers(options = {}) {
  const {
    page = 1,
    limit = 20,
    organizationId,
    startDate,
    endDate,
    role,
    sortBy = "cumulativeNetBalanceKgCO2",
    sortOrder = "desc",
  } = options;

  const match = {};
  if (organizationId) {
    match.organization = new mongoose.Types.ObjectId(organizationId);
  }
  if (role) {
    match.role = role;
  }

  const pipeline = [
    { $match: { ...match } },
    {
      $lookup: {
        from: "farmcarbonprofiles",
        localField: "_id",
        foreignField: "userId",
        as: "profiles",
      },
    },
    {
      $addFields: {
        totalEmission: { $sum: "$profiles.cumulativeEmissionKgCO2" },
        totalCaptured: { $sum: "$profiles.cumulativeCapturedKgCO2" },
        totalNetBalance: { $sum: "$profiles.cumulativeNetBalanceKgCO2" },
        fieldCount: { $size: "$profiles" },
        lastDate: { $max: "$profiles.lastAdvisoryDate" },
      },
    },
    { $match: { fieldCount: { $gt: 0 } } },
  ];

  if (startDate || endDate) {
    const dateMatch = {};
    if (startDate) dateMatch.$gte = startDate;
    if (endDate) dateMatch.$lte = endDate;
    pipeline.push({ $match: { lastDate: dateMatch } });
  }

  const countPipeline = [...pipeline, { $count: "total" }];
  const [countResult] = await User.aggregate(countPipeline);
  const total = countResult?.total ?? 0;

  const sortField =
    sortBy === "emission"
      ? "totalEmission"
      : sortBy === "captured"
        ? "totalCaptured"
        : sortBy === "lastUpdated"
          ? "lastDate"
          : "totalNetBalance";
  const sortDir = sortOrder === "asc" ? 1 : -1;

  pipeline.push(
    { $sort: { [sortField]: sortDir } },
    { $skip: (page - 1) * limit },
    { $limit: limit },
    {
      $project: {
        userId: "$_id",
        firstName: 1,
        lastName: 1,
        phone: 1,
        totalFields: "$fieldCount",
        totalEmissionKgCO2: { $round: ["$totalEmission", 2] },
        totalCapturedKgCO2: { $round: ["$totalCaptured", 2] },
        totalNetBalanceKgCO2: { $round: ["$totalNetBalance", 2] },
        lastAdvisoryDate: "$lastDate",
      },
    }
  );

  const data = await User.aggregate(pipeline);

  const formatted = data.map((d) => ({
    userId: d.userId,
    farmerName: [d.firstName, d.lastName].filter(Boolean).join(" ").trim() || "—",
    phone: d.phone || "—",
    totalFields: d.totalFields ?? 0,
    totalEmissionKgCO2: d.totalEmissionKgCO2 ?? 0,
    totalCapturedKgCO2: d.totalCapturedKgCO2 ?? 0,
    totalNetBalanceKgCO2: d.totalNetBalanceKgCO2 ?? 0,
    lastAdvisoryDate: d.lastAdvisoryDate,
  }));

  return {
    data: formatted,
    pagination: {
      total,
      page: Number(page),
      limit: Number(limit),
      totalPages: Math.ceil(total / limit),
    },
  };
}

export async function getAdminOrganizations(options = {}) {
  const { startDate, endDate } = options;

  const profileMatch = {};
  if (startDate || endDate) {
    profileMatch.lastAdvisoryDate = {};
    if (startDate) profileMatch.lastAdvisoryDate.$gte = startDate;
    if (endDate) profileMatch.lastAdvisoryDate.$lte = endDate;
  }

  const pipeline = [
    {
      $lookup: {
        from: "users",
        localField: "userId",
        foreignField: "_id",
        as: "user",
      },
    },
    { $unwind: { path: "$user", preserveNullAndEmptyArrays: true } },
    {
      $match: {
        ...profileMatch,
        "user.organization": { $exists: true, $ne: null },
      },
    },
    {
      $group: {
        _id: "$user.organization",
        farmCount: { $sum: 1 },
        emission: { $sum: "$cumulativeEmissionKgCO2" },
        captured: { $sum: "$cumulativeCapturedKgCO2" },
        netBalance: { $sum: "$cumulativeNetBalanceKgCO2" },
      },
    },
  ];

  let groups = await FarmCarbonProfile.aggregate(pipeline);

  let orgNames = {};
  try {
    const orgList = await mongoose.connection.db
      .collection("organizations")
      .find({ _id: { $in: groups.map((g) => g._id) } })
      .project({ _id: 1, name: 1 })
      .toArray();
    orgNames = Object.fromEntries(orgList.map((o) => [o._id.toString(), o.name]));
  } catch {
    // organizations collection may not exist
  }

  const orgIds = groups.map((g) => g._id).filter(Boolean);
  const farmerCounts =
    orgIds.length > 0
      ? await User.aggregate([
          { $match: { organization: { $in: orgIds } } },
          { $group: { _id: "$organization", count: { $sum: 1 } } },
        ])
      : [];
  const farmerMap = Object.fromEntries(
    farmerCounts.map((f) => [f._id?.toString(), f.count])
  );

  const data = groups.map((g) => ({
    organizationId: g._id,
    organizationName: orgNames[g._id?.toString()] ?? "Unknown",
    farmCount: g.farmCount ?? 0,
    farmerCount: farmerMap[g._id?.toString()] ?? 0,
    totalEmissionKgCO2: Math.round((g.emission ?? 0) * 100) / 100,
    totalCapturedKgCO2: Math.round((g.captured ?? 0) * 100) / 100,
    totalNetBalanceKgCO2: Math.round((g.netBalance ?? 0) * 100) / 100,
  }));

  return { data };
}

export async function getPlatformTotal(options = {}) {
  const { startDate, endDate, includeMonthly = true } = options;

  const match = {};
  if (startDate || endDate) {
    match.date = {};
    if (startDate) match.date.$gte = startDate;
    if (endDate) match.date.$lte = endDate;
  }

  const totalPipeline = [
    { $match: Object.keys(match).length ? match : {} },
    {
      $group: {
        _id: null,
        totalEmission: { $sum: "$emissionKgCO2" },
        totalCaptured: { $sum: "$capturedKgCO2" },
        totalNetBalance: { $sum: "$netBalanceKgCO2" },
        recordCount: { $sum: 1 },
      },
    },
  ];

  const [totalResult] = await FarmCarbonRecord.aggregate(totalPipeline);

  const uniqueFarms = await FarmCarbonProfile.distinct("farmFieldId");
  const uniqueFarmers = await FarmCarbonProfile.distinct("userId");

  const monthlyBreakdown = includeMonthly
    ? await FarmCarbonRecord.aggregate([
        { $match: Object.keys(match).length ? match : {} },
        {
          $group: {
            _id: { $substr: ["$date", 0, 7] },
            emission: { $sum: "$emissionKgCO2" },
            captured: { $sum: "$capturedKgCO2" },
            netBalance: { $sum: "$netBalanceKgCO2" },
          },
        },
        { $sort: { _id: 1 } },
        {
          $project: {
            month: "$_id",
            emissionKgCO2: { $round: ["$emission", 2] },
            capturedKgCO2: { $round: ["$captured", 2] },
            netBalanceKgCO2: { $round: ["$netBalance", 2] },
          },
        },
      ])
    : [];

  return {
    data: {
      totalFarms: uniqueFarms.length,
      totalFarmers: uniqueFarmers.length,
      totalEmissionKgCO2: Math.round((totalResult?.totalEmission ?? 0) * 100) / 100,
      totalCapturedKgCO2: Math.round((totalResult?.totalCaptured ?? 0) * 100) / 100,
      totalNetBalanceKgCO2: Math.round((totalResult?.totalNetBalance ?? 0) * 100) / 100,
      carbonCreditsEquivalent: Math.round((totalResult?.totalNetBalance ?? 0) / 1000 * 100) / 100,
      monthlyBreakdown,
    },
  };
}
