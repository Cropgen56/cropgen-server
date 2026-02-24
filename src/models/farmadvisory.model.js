import mongoose from "mongoose";
const { Schema } = mongoose;

/* ================= ACTIVITY SCHEMA ================= */

const ActivitySchema = new Schema(
  {
    type: {
      type: String,
      enum: ["SPRAY", "FERTIGATION", "IRRIGATION", "WEATHER", "CROP_RISK"],
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

/* ================= WHATSAPP STATUS SCHEMA ================= */

const WhatsAppNotificationSchema = new Schema(
  {
    isSent: {
      type: Boolean,
      default: false,
      index: true,
    },
    status: {
      type: String,
      enum: ["pending", "sent", "delivered", "read", "failed"],
      default: "pending",
    },
    messageId: {
      type: String,
      default: null,
      index: true,
    },
    retryCount: {
      type: Number,
      default: 0,
    },
    error: {
      type: String,
      default: null,
    },
    lastAttemptAt: {
      type: Date,
      default: null,
    },
    sentAt: {
      type: Date,
      default: null,
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
      index: true,
    },

    activitiesToDo: {
      type: [ActivitySchema],
      default: [],
    },

    whatsappNotification: {
      type: WhatsAppNotificationSchema,
      default: () => ({}),
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
  },
  { timestamps: true },
);

FarmAdvisorySchema.index({ farmFieldId: 1 });
FarmAdvisorySchema.index({ "whatsappNotification.isSent": 1 });
FarmAdvisorySchema.index({ "whatsappNotification.status": 1 });
FarmAdvisorySchema.index({ createdAt: -1 });

export default mongoose.model("FarmAdvisory", FarmAdvisorySchema);
