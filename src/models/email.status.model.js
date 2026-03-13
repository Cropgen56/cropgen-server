import mongoose from "mongoose";

const schema = new mongoose.Schema(
  {
    campaign: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Campaign",
      required: true,
    },
    recipient: { type: String, required: true },
    status: {
      type: String,
      enum: ["queued", "sent", "failed"],
      default: "queued",
    },
    messageId: { type: String },
    error: { type: Object },
    attempts: { type: Number, default: 0 },
    lastAttemptAt: { type: Date },
    isTest: { type: Boolean, default: false },
    batchId: { type: String },
  },
  { timestamps: true }
);

schema.index({ campaign: 1, status: 1, createdAt: -1 });
schema.index({ campaign: 1, recipient: 1 });
schema.index({ isTest: 1, createdAt: -1 });

export default mongoose.models.EmailStatus ||
  mongoose.model("EmailStatus", schema);
