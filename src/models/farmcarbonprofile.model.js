import mongoose from "mongoose";

const { Schema } = mongoose;

/**
 * Cumulative carbon profile per farmer + field.
 * Updated when each advisory is generated.
 * Use for quick display of farmer's carbon credit status.
 */
const FarmCarbonProfileSchema = new Schema(
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
    cumulativeEmissionKgCO2: {
      type: Number,
      default: 0,
    },
    cumulativeCapturedKgCO2: {
      type: Number,
      default: 0,
    },
    cumulativeNetBalanceKgCO2: {
      type: Number,
      default: 0,
    },
    recordCount: {
      type: Number,
      default: 0,
    },
    lastAdvisoryDate: {
      type: String,
      default: null,
    }, // YYYY-MM-DD
  },
  { timestamps: true }
);

FarmCarbonProfileSchema.index({ userId: 1, farmFieldId: 1 }, { unique: true });
FarmCarbonProfileSchema.index({ userId: 1 });

export default mongoose.model("FarmCarbonProfile", FarmCarbonProfileSchema);
