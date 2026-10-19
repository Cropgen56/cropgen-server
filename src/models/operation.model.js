import mongoose from "mongoose";

const operationSchema = new mongoose.Schema(
  {
    farmField: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "FarmField",
      required: true,
    },
    supervisorName: {
      type: String,
      trim: true,
    },
    operationType: {
      type: String,
      enum: [
        "tillage",
        "cultivator",
        "sowing",
        "transplanting",
        "fertilizer_application",
        "harvesting",
        "spray",
        "interculture_operation",
        "other",
      ],
      required: true,
    },
    chemicalUsed: {
      type: String,
      trim: true,
    },
    chemicalQuantity: {
      type: String,
      trim: true,
    },
    progress: {
      type: String,
      enum: ["completed", "in_progress", "started", null],
      default: null,
    },
    labourMale: {
      type: Number,
      min: 0,
    },
    labourFemale: {
      type: Number,
      min: 0,
    },
    estimatedCost: {
      type: Number,
      min: 0,
    },
    comments: {
      type: String,
      trim: true,
    },
    /** Set when created from Smart Advisory generation */
    source: {
      type: String,
      enum: ["manual", "advisory"],
      default: "manual",
    },
    advisoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "FarmAdvisory",
      default: null,
    },
    advisoryActivityType: {
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
      default: null,
    },
    operationDate: {
      type: String,
      required: true,
      match: [/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format"],
    },
    operationTime: {
      type: String,
      required: true,
      match: [/^\d{2}:\d{2}:\d{2}$/, "Time must be in HH:mm:ss format"],
    },
  },
  {
    timestamps: true,
  }
);

operationSchema.index({ farmField: 1, operationDate: 1 });
operationSchema.index({ advisoryId: 1 });
operationSchema.index({ farmField: 1, source: 1, progress: 1 });
operationSchema.index({ farmField: 1, advisoryId: 1, advisoryActivityType: 1 });

const Operation = mongoose.model("Operation", operationSchema);

export default Operation;
