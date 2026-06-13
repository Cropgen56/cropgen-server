import mongoose from "mongoose";
import FarmField from "../../../../models/field.model.js";
import FarmAdvisory from "../../../../features/advisory/models/farmAdvisory.model.js";
import { enrichAdvisoriesForClient } from "../../../../features/advisory/utils/enrichAdvisoryForClient.js";
import { assertCrmFarmerAccess } from "../../services/crmSubscription.service.js";

function formatDate(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function formatCrmAdvisory(advisory) {
  const activities = (advisory.activitiesToDo || []).map((activity) => ({
    type: activity.type,
    title: activity.title,
    message: activity.message,
    progress: activity.progress || null,
    completedAt: formatDate(activity.completedAt),
  }));

  return {
    id: String(advisory._id),
    createdAt: formatDate(advisory.createdAt),
    activitiesCount: activities.length,
    activities,
    cropHealth: advisory.cropHealth
      ? {
          score: advisory.cropHealth.score ?? null,
          percentage: advisory.cropHealth.percentage ?? null,
          category: advisory.cropHealth.category || null,
          recommendation: advisory.cropHealth.recommendation || null,
        }
      : null,
    growthStage: advisory.cropStage?.label
      ? {
          label: advisory.cropStage.label,
          bbchStage: advisory.cropStage.bbchStage,
          cropAgeDays: advisory.cropStage.cropAgeDays,
        }
      : advisory.plantGrowthActivity?.stageName
        ? {
            label: advisory.plantGrowthActivity.stageName,
            bbchStage: advisory.plantGrowthActivity.bbchStage ?? null,
            cropAgeDays: advisory.plantGrowthActivity.cropAgeDays ?? null,
          }
        : null,
    yield: advisory.yield
      ? {
          aiYield: advisory.yield.aiYield ?? null,
          standardYield: advisory.yield.standardYield ?? null,
          unit: advisory.yield.unit || "quintal",
        }
      : null,
    activitiesSource: advisory.activitiesSource || null,
  };
}

export async function listCrmFarmerAdvisories(req, res) {
  try {
    const { id: farmerId } = req.params;
    const fieldIdFilter = req.query.fieldId;
    const limitPerField = Math.min(
      50,
      Math.max(1, Number(req.query.limitPerField) || 10),
    );

    await assertCrmFarmerAccess(req, farmerId);

    const fieldQuery = { user: farmerId };
    if (
      fieldIdFilter &&
      mongoose.Types.ObjectId.isValid(String(fieldIdFilter))
    ) {
      fieldQuery._id = fieldIdFilter;
    }

    const fields = await FarmField.find(fieldQuery)
      .select("fieldName cropName variety acre sowingDate isBarrenLand")
      .sort({ updatedAt: -1 })
      .lean();

    if (!fields.length) {
      return res.status(200).json({
        success: true,
        data: { fields: [], totalAdvisories: 0 },
      });
    }

    const fieldIds = fields.map((f) => f._id);
    const advisories = await FarmAdvisory.find({
      farmFieldId: { $in: fieldIds },
    })
      .sort({ createdAt: -1 })
      .lean();

    const enriched = enrichAdvisoriesForClient(advisories, { language: "en" });

    const advisoriesByField = new Map();
    const totalByField = new Map();
    for (const field of fields) {
      const key = String(field._id);
      advisoriesByField.set(key, []);
      totalByField.set(key, 0);
    }

    for (const advisory of enriched) {
      const key = String(advisory.farmFieldId);
      if (!totalByField.has(key)) continue;
      totalByField.set(key, (totalByField.get(key) || 0) + 1);
      const bucket = advisoriesByField.get(key);
      if (bucket && bucket.length < limitPerField) {
        bucket.push(advisory);
      }
    }

    const grouped = fields.map((field) => {
      const key = String(field._id);
      const fieldAdvisories = advisoriesByField.get(key) || [];
      const fieldTotal = totalByField.get(key) || 0;
      return {
        field: {
          id: String(field._id),
          fieldName: field.fieldName || "—",
          cropName: field.cropName || "—",
          variety: field.variety || "—",
          acre: Number(field.acre) || 0,
          sowingDate: field.sowingDate || null,
          isBarrenLand: Boolean(field.isBarrenLand),
        },
        advisories: fieldAdvisories.map(formatCrmAdvisory),
        total: fieldTotal,
      };
    });

    const totalAdvisories = grouped.reduce((sum, g) => sum + g.total, 0);

    return res.status(200).json({
      success: true,
      data: {
        fields: grouped,
        totalAdvisories,
      },
    });
  } catch (error) {
    const statusCode = error.status || 500;
    if (statusCode >= 500) console.error("listCrmFarmerAdvisories:", error);
    return res.status(statusCode).json({
      success: false,
      message: error.message || "Failed to load farmer advisories",
    });
  }
}
