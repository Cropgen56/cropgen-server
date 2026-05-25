import mongoose from "mongoose";

const monitoringRequestSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    fieldId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "FarmField",
      required: true,
      index: true,
    },
    clientApp: {
      type: String,
      enum: ["lfp-app"],
      default: "lfp-app",
      required: true,
    },
    requestStatus: {
      type: String,
      enum: ["pending", "in_progress", "completed", "rejected"],
      default: "pending",
      index: true,
    },
    requestedFieldSnapshot: {
      fieldName: { type: String, default: "" },
      cropName: { type: String, default: "" },
      variety: { type: String, default: "" },
      acre: { type: Number, default: 0 },
      typeOfIrrigation: { type: String, default: "" },
      typeOfFarming: { type: String, default: "" },
      sowingDate: { type: String, default: "" },
      isBarrenLand: { type: Boolean, default: false },
      farmStatus: { type: String, default: "" },
    },
    allFarmsSnapshot: [
      {
        fieldId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "FarmField",
          required: true,
        },
        fieldName: { type: String, default: "" },
        cropName: { type: String, default: "" },
        acre: { type: Number, default: 0 },
        sowingDate: { type: String, default: "" },
        isBarrenLand: { type: Boolean, default: false },
        farmStatus: { type: String, default: "" },
      },
    ],
    farmerSnapshot: {
      name: { type: String, default: "" },
      phone: { type: String, default: "" },
      email: { type: String, default: "" },
    },
  },
  { timestamps: true }
);

monitoringRequestSchema.index({ userId: 1, createdAt: -1 });
monitoringRequestSchema.index({ fieldId: 1, createdAt: -1 });

export default mongoose.model("MonitoringRequest", monitoringRequestSchema);
