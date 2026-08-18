import FieldCrop from "../../../../models/field-crop.model.js";

/**
 * All currently-active crop instances for a farm (multi-crop advisory
 * fan-out). Empty array means the farm is effectively barren right now,
 * regardless of what its (possibly stale) `isBarrenLand` flag says.
 */
export async function getActiveCropsForFarm(farmFieldId) {
  return FieldCrop.find({ farmField: farmFieldId, isActive: true }).sort({
    cropRole: 1, // "main" sorts first
    createdAt: 1,
  });
}

/**
 * The farm's "primary" active crop instance — the one legacy single-crop
 * callers (initial trigger on farm creation, direct API calls without a
 * cropInstanceId, etc.) should advise on. Prefers the main-role crop, falls
 * back to the earliest-added active crop of any role.
 */
export async function getPrimaryActiveCrop(farmFieldId) {
  const mainCrop = await FieldCrop.findOne({
    farmField: farmFieldId,
    isActive: true,
    cropRole: "main",
  }).sort({ createdAt: 1 });
  if (mainCrop) return mainCrop;

  return FieldCrop.findOne({
    farmField: farmFieldId,
    isActive: true,
  }).sort({ createdAt: 1 });
}

/**
 * Builds a synthetic (unsaved) crop instance from a farm's legacy flat
 * fields. Safety net for the (post-migration) edge case of a non-barren
 * farm that somehow has no FieldCrop record yet, so advisory generation
 * never hard-fails on a missing crop instance.
 */
export function syntheticCropFromLegacyField(farmField) {
  return {
    _id: null,
    farmField: farmField._id,
    user: farmField.user,
    cropName: farmField.cropName,
    variety: farmField.variety || "",
    cropRole: "main",
    cropLifecycleType: "seasonal",
    startDate: farmField.sowingDate || new Date(),
    expectedEndDate: null,
    actualEndDate: null,
    isActive: true,
  };
}
