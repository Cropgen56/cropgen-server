import FarmField from "../../../models/field.model.js";
import FieldCrop from "../../../models/field-crop.model.js";
import { runCropAdvisoryPipeline } from "../pipeline/cropPipeline.js";
import { generateBarrenLandAdvisoryForField } from "./barrenLandAdvisory.service.js";
import { buildFarmAdvisorySummary } from "./farmAdvisorySummary.service.js";
import {
  getActiveCropsForFarm,
  getPrimaryActiveCrop,
  syntheticCropFromLegacyField,
} from "../utils/shared/cropInstances.js";

/**
 * Generate a farm advisory via the modular crop pipeline (modules 1–7), for
 * one crop instance at a time. Barren land fields (or a farm with no active
 * crops at all) delegate to the pre-sowing pipeline.
 *
 * `cropInstanceId` is optional: omit it to advise the farm's "primary"
 * active crop — this keeps every pre-multi-crop caller (initial trigger on
 * farm creation, manual "regenerate" API, single-crop farms in general)
 * working exactly as before. Pass it explicitly to advise one specific crop
 * on a multi-crop farm (used by the daily worker and by `generateAdvisoryForFarmCrops`
 * below, which loops every active crop).
 */
export async function generateAdvisoryForField(
  farmFieldId,
  geometryId,
  language,
  platform = "whatsapp",
  options = {},
  cropInstanceId = null,
) {
  const { preferShortHistoricalWindow = false, lightweight = false } = options;

  const farmField = await FarmField.findById(farmFieldId).lean();
  if (!farmField) {
    throw new Error(`FarmField not found: ${farmFieldId}`);
  }

  const cropInstance = await resolveCropInstance(farmField, cropInstanceId);

  if (!cropInstance) {
    // No active crop (barren, or every crop has been harvested/retired).
    return generateBarrenLandAdvisoryForField(
      farmFieldId,
      geometryId,
      language,
      platform,
      { lightweight },
    );
  }

  const { advisory } = await runCropAdvisoryPipeline({
    farmField,
    cropInstance,
    geometryId,
    language,
    platform,
    lightweight,
    preferShortHistoricalWindow,
  });

  return advisory;
}

/**
 * Multi-crop: generate advisory separately for every currently-active crop
 * on a farm, sharing the same farm-level geometry/weather/satellite inputs
 * (each module re-fetches per crop since historical windows differ by
 * sowing date — see the Phase 2 plan notes), then combine the results into
 * a farm-level summary. Falls back to the single barren-land advisory when
 * the farm has no active crop.
 */
export async function generateAdvisoryForFarmCrops(
  farmFieldId,
  geometryId,
  language,
  platform = "whatsapp",
  options = {},
) {
  const farmField = await FarmField.findById(farmFieldId).lean();
  if (!farmField) {
    throw new Error(`FarmField not found: ${farmFieldId}`);
  }

  const activeCrops = await getActiveCropsForFarm(farmFieldId);

  if (!activeCrops.length) {
    const advisory = await generateBarrenLandAdvisoryForField(
      farmFieldId,
      geometryId,
      language,
      platform,
      { lightweight: options.lightweight },
    );
    return { mode: "barren", crops: [], farmSummary: null, advisory };
  }

  const crops = [];
  for (const cropInstance of activeCrops) {
    try {
      const { advisory } = await runCropAdvisoryPipeline({
        farmField,
        cropInstance,
        geometryId,
        language,
        platform,
        lightweight: options.lightweight,
        preferShortHistoricalWindow: options.preferShortHistoricalWindow,
      });
      crops.push({
        cropInstanceId: String(cropInstance._id),
        cropName: cropInstance.cropName,
        cropRole: cropInstance.cropRole,
        advisory,
      });
    } catch (err) {
      crops.push({
        cropInstanceId: String(cropInstance._id),
        cropName: cropInstance.cropName,
        cropRole: cropInstance.cropRole,
        error: err?.message || String(err),
      });
    }
  }

  return {
    mode: "multi-crop",
    crops,
    farmSummary: buildFarmAdvisorySummary(crops),
  };
}

async function resolveCropInstance(farmField, cropInstanceId) {
  if (cropInstanceId) {
    const crop = await FieldCrop.findOne({
      _id: cropInstanceId,
      farmField: farmField._id,
      isActive: true,
    });
    if (crop) return crop;
    // Requested crop isn't active/found anymore — fall through to barren-land
    // handling below rather than silently advising a different crop.
    return null;
  }

  if (farmField.isBarrenLand) return null;

  const primary = await getPrimaryActiveCrop(farmField._id);
  if (primary) return primary;

  // Safety net: non-barren farm with no FieldCrop yet (shouldn't happen once
  // the Phase 1 dual-write/migration has run, but never hard-fail on it).
  return farmField.cropName ? syntheticCropFromLegacyField(farmField) : null;
}
