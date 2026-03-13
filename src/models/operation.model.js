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
      enum: ["completed", "in_progress", "started"],
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

const Operation = mongoose.model("Operation", operationSchema);

export default Operation;
