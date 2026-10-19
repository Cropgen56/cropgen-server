import mongoose from "mongoose";

const { Schema } = mongoose;

/**
 * Daily carbon record per field, per crop instance.
 * One record per (farmFieldId, cropInstanceId, date) - created when advisory
 * is generated. Multi-crop: a farm's advisory pipeline now runs once per
 * active crop, so the crop dimension is part of the uniqueness key —
 * otherwise a second crop's same-day record would silently overwrite the
 * first's. `cropInstanceId` is null for barren-land (no active crop) advisories.
 * Used for history, MRV, and audit trail.
 */
const FarmCarbonRecordSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    farmFieldId: {
      type: Schema.Types.ObjectId,
      ref: "FarmField",
      required: true,
      index: true,
    },
    cropInstanceId: {
      type: Schema.Types.ObjectId,
      ref: "FieldCrop",
      default: null,
      index: true,
    },
    advisoryId: {
      type: Schema.Types.ObjectId,
      ref: "FarmAdvisory",
      default: null,
    },
    date: {
      type: String,
      required: true,
      index: true,
    }, // YYYY-MM-DD
    emissionKgCO2: {
      type: Number,
      default: 0,
    },
    capturedKgCO2: {
      type: Number,
      default: 0,
    },
    netBalanceKgCO2: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

FarmCarbonRecordSchema.index(
  { farmFieldId: 1, cropInstanceId: 1, date: 1 },
  { unique: true },
);
FarmCarbonRecordSchema.index({ userId: 1, date: 1 });

export default mongoose.model("FarmCarbonRecord", FarmCarbonRecordSchema);
