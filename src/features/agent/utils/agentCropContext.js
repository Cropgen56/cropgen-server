import FieldCrop from "../../../models/field-crop.model.js";
import FarmAdvisory from "../../advisory/models/farmAdvisory.model.js";

/**
 * Multi-crop context for the AI agent: attaches each farm's currently-active
 * crop instances as a `.crops` array, and resolves the latest FarmAdvisory
 * per crop instance (`advisoryByCropId`). Farms with no active crop right
 * now (barren land, or a not-yet-migrated legacy farm) fall back to the
 * latest farm-level advisory (`advisoryByFarmId`) — the same shape the
 * system prompt used before multi-crop existed.
 */
export async function attachCropContextToFarms(farms) {
  if (!farms?.length) {
    return { farms: [], advisoryByCropId: {}, advisoryByFarmId: {} };
  }

  const farmIds = farms.map((f) => f._id);
  const activeCrops = await FieldCrop.find({
    farmField: { $in: farmIds },
    isActive: true,
  }).lean();

  const cropsByFarmId = new Map();
  activeCrops.forEach((c) => {
    const id = String(c.farmField);
    if (!cropsByFarmId.has(id)) cropsByFarmId.set(id, []);
    cropsByFarmId.get(id).push(c);
  });

  const farmsWithCrops = farms.map((f) => ({
    ...f,
    crops: cropsByFarmId.get(String(f._id)) || [],
  }));

  const cropIds = activeCrops.map((c) => c._id);
  const farmIdsWithNoCrops = farmsWithCrops
    .filter((f) => !f.crops.length)
    .map((f) => f._id);

  const [cropAdvisories, farmLevelAdvisories] = await Promise.all([
    cropIds.length
      ? FarmAdvisory.aggregate([
          { $match: { cropInstanceId: { $in: cropIds } } },
          { $sort: { createdAt: -1 } },
          { $group: { _id: "$cropInstanceId", doc: { $first: "$$ROOT" } } },
        ])
      : [],
    farmIdsWithNoCrops.length
      ? FarmAdvisory.aggregate([
          { $match: { farmFieldId: { $in: farmIdsWithNoCrops } } },
          { $sort: { createdAt: -1 } },
          { $group: { _id: "$farmFieldId", doc: { $first: "$$ROOT" } } },
        ])
      : [],
  ]);

  const advisoryByCropId = {};
  cropAdvisories.forEach((g) => {
    advisoryByCropId[String(g._id)] = g.doc;
  });

  const advisoryByFarmId = {};
  farmLevelAdvisories.forEach((g) => {
    advisoryByFarmId[String(g._id)] = g.doc;
  });

  return { farms: farmsWithCrops, advisoryByCropId, advisoryByFarmId };
}
