import FarmField from "../../../models/field.model.js";
import { runBarrenAdvisoryPipeline } from "../pipeline/barrenPipeline.js";

/**
 * Pre-sowing advisory for fields marked isBarrenLand (no standing crop).
 */
export async function generateBarrenLandAdvisoryForField(
  farmFieldId,
  geometryId,
  language,
  platform = "whatsapp",
  options = {},
) {
  const { lightweight = false } = options;

  const farmField = await FarmField.findById(farmFieldId).lean();
  if (!farmField) {
    throw new Error(`FarmField not found: ${farmFieldId}`);
  }

  const { advisory } = await runBarrenAdvisoryPipeline({
    farmField,
    geometryId,
    language,
    platform,
    lightweight,
  });

  return advisory;
}
