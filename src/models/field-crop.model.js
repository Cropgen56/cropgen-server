import mongoose from "mongoose";
import { CROP_LIFECYCLE_TYPES, CROP_ROLES } from "../constants/farmEnums.js";

/**
 * A single crop instance growing (or grown) on a FarmField. A farm can have
 * several of these concurrently (multi-crop) plus a history of past
 * (harvested / removed) ones. This is per-farm instance data, distinct from
 * the `Crop` model (src/models/crop.model.js), which is the crop-agronomy
 * *catalog* (pest/fertilizer/variety reference info), not a planting record.
 *
 * `farmField.typeOfIrrigation` / `farmField.typeOfFarming` and all soil /
 * weather / satellite data stay at the farm level and are shared by every
 * crop instance on that farm — interpreted per crop, never duplicated here.
 */
const fieldCropSchema = new mongoose.Schema(
  {
    farmField: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "FarmField",
      required: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    cropName: { type: String, required: true, trim: true },
    variety: { type: String, default: "", trim: true },
    /** Seasonal crops auto-deactivate at harvest; perennial crops stay active until manually retired. */
    cropLifecycleType: {
      type: String,
      enum: CROP_LIFECYCLE_TYPES,
      required: true,
      default: "seasonal",
    },
    /** The crop's role on the farm, alongside any other concurrent crops. */
    cropRole: {
      type: String,
      enum: CROP_ROLES,
      required: true,
      default: "main",
    },
    startDate: { type: Date, required: true },
    /** Required (at the validation layer) for seasonal crops; optional for perennial. */
    expectedEndDate: { type: Date },
    /** Set when the crop is actually harvested / retired. */
    actualEndDate: { type: Date },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

fieldCropSchema.index({ farmField: 1, isActive: 1 });
fieldCropSchema.index({ user: 1 });

export default mongoose.model("FieldCrop", fieldCropSchema);
