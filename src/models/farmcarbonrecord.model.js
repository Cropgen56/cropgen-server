import mongoose from "mongoose";

const { Schema } = mongoose;

/**
 * Daily carbon record per field.
 * One record per (farmFieldId, date) - created when advisory is generated.
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

FarmCarbonRecordSchema.index({ farmFieldId: 1, date: 1 }, { unique: true });
FarmCarbonRecordSchema.index({ userId: 1, date: 1 });

export default mongoose.model("FarmCarbonRecord", FarmCarbonRecordSchema);
