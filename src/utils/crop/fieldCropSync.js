import FieldCrop from "../../models/field-crop.model.js";

function parseLegacyDate(value) {
  const d = value ? new Date(value) : new Date();
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

/**
 * Create the "primary" (main-role) FieldCrop record mirroring a freshly
 * created farm's legacy flat crop fields. Called from addField so every
 * (non-barren) farm has exactly one FieldCrop from creation onward, without
 * requiring the frontend to change (multi-crop Phase 1 dual-write).
 */
export async function createPrimaryFieldCrop(farmField) {
  if (farmField.isBarrenLand) return null; // no crop actually planted yet

  return FieldCrop.create({
    farmField: farmField._id,
    user: farmField.user,
    cropName: farmField.cropName,
    variety: farmField.variety || "",
    cropRole: "main",
    cropLifecycleType: "seasonal",
    startDate: parseLegacyDate(farmField.sowingDate),
    isActive: true,
  });
}

/**
 * Keep the farm's primary (main-role) FieldCrop in sync whenever a farm is
 * updated through the legacy flat-field updateField endpoint. Creates one if
 * none exists yet (e.g. a barren-land plot being planted for the first
 * time), deactivates it if the land is being marked barren again, or patches
 * its name/variety/start date otherwise.
 *
 * `farmField` is the pre-update FarmField doc; `updateData` is the same
 * whitelisted patch object updateField is about to $set.
 */
export async function syncPrimaryFieldCrop(farmField, updateData) {
  const touchesCropFields = [
    "cropName",
    "variety",
    "sowingDate",
    "isBarrenLand",
  ].some((key) => Object.prototype.hasOwnProperty.call(updateData, key));
  if (!touchesCropFields) return;

  if (updateData.isBarrenLand === true) {
    await FieldCrop.updateMany(
      { farmField: farmField._id, cropRole: "main", isActive: true },
      { $set: { isActive: false, actualEndDate: new Date() } },
    );
    return;
  }

  const primary = await FieldCrop.findOne({
    farmField: farmField._id,
    cropRole: "main",
    isActive: true,
  }).sort({ createdAt: -1 });

  const nextCropName = updateData.cropName ?? farmField.cropName;
  const nextVariety = updateData.variety ?? farmField.variety ?? "";
  const nextSowingDate = updateData.sowingDate ?? farmField.sowingDate;

  if (!primary) {
    if (!nextCropName) return; // nothing to plant yet
    await FieldCrop.create({
      farmField: farmField._id,
      user: farmField.user,
      cropName: nextCropName,
      variety: nextVariety,
      cropRole: "main",
      cropLifecycleType: "seasonal",
      startDate: parseLegacyDate(nextSowingDate),
      isActive: true,
    });
    return;
  }

  const patch = {};
  if (updateData.cropName != null) patch.cropName = updateData.cropName;
  if (updateData.variety != null) patch.variety = updateData.variety;
  if (updateData.sowingDate != null)
    patch.startDate = parseLegacyDate(updateData.sowingDate);
  if (Object.keys(patch).length) {
    await FieldCrop.updateOne({ _id: primary._id }, { $set: patch });
  }
}
