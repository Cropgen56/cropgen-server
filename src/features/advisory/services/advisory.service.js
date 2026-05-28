import FarmField from "../../../models/field.model.js";
import { runCropAdvisoryPipeline } from "../pipeline/cropPipeline.js";
import { generateBarrenLandAdvisoryForField } from "./barrenLandAdvisory.service.js";

/**
 * Generate a farm advisory via the modular crop pipeline (modules 1–7).
 * Barren land fields delegate to the pre-sowing pipeline.
 */
export async function generateAdvisoryForField(
  farmFieldId,
  geometryId,
  language,
  platform = "whatsapp",
  options = {},
) {
  const { preferShortHistoricalWindow = false, lightweight = false } = options;

  const farmField = await FarmField.findById(farmFieldId).lean();
  if (!farmField) {
    throw new Error(`FarmField not found: ${farmFieldId}`);
  }

  if (farmField.isBarrenLand) {
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
    geometryId,
    language,
    platform,
    lightweight,
    preferShortHistoricalWindow,
  });

  return advisory;
}
