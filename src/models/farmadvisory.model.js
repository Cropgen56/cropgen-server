import mongoose from "mongoose";
const { Schema } = mongoose;

/* ================= ACTIVITY SCHEMA ================= */

const ActivitySchema = new Schema(
  {
    type: {
      type: String,
      enum: [
        "SPRAY",
        "FERTIGATION",
        "IRRIGATION",
        "WEATHER",
        "CROP_RISK",
        "MONITORING",
        "CARBON_TRACKING",
      ],
      required: true,
    },

    title: {
      type: String,
      required: true,
    },

    message: {
      type: String,
      required: true,
    },

    details: {
      chemical: String,
      fertilizer: String,
      quantity: String,
      method: String,
      time: String,
    },
  },
  { _id: false },
);

/* ================= MAIN ================= */

const FarmAdvisorySchema = new Schema(
  {
    farmFieldId: {
      type: Schema.Types.ObjectId,
      ref: "FarmField",
      required: true,
    },

    activitiesToDo: {
      type: [ActivitySchema],
      default: [],
    },

    cropHealth: {
      score: Number,
      percentage: Number,
      category: String,
      recommendation: String,
    },

    yield: {
      standardYield: Number,
      aiYield: Number,
      unit: {
        type: String,
        enum: ["tons", "quintal"],
        default: "quintal",
      },
      explanation: String,
    },

    plantGrowthActivity: {
      bbchStage: Number,
      stageName: String,
      description: String,
      cumulativeGDD: Number,
    },

    npkManagement: Schema.Types.Mixed,

    carbonData: {
      emissionKgCO2: Number,
      capturedKgCO2: Number,
      netBalanceKgCO2: Number,
    },
  },
  { timestamps: true },
);

FarmAdvisorySchema.index({ farmFieldId: 1 });
FarmAdvisorySchema.index({ createdAt: -1 });

export default mongoose.model("FarmAdvisory", FarmAdvisorySchema);
