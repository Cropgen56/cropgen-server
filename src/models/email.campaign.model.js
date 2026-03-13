import mongoose from "mongoose";

const EmailCampaingSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    subject: { type: String, required: true },
    html: { type: String, required: true },
    from: { type: String, required: true },
    segment: { type: Object, default: null },

    totalRecipients: { type: Number, default: 0 },
    enqueuedBatches: { type: Number, default: 0 },
    sentCount: { type: Number, default: 0 },
    failedCount: { type: Number, default: 0 },

    status: {
      type: String,
      enum: ["draft", "queued", "sending", "completed", "failed"],
      default: "draft",
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true }
);

EmailCampaingSchema.index({ createdAt: -1, status: 1 });

const EmailCampaing = mongoose.model("Campaign", EmailCampaingSchema);
export default EmailCampaing;
