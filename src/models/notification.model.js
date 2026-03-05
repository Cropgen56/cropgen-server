import mongoose from "mongoose";

const { Schema } = mongoose;

const NotificationSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    type: {
      type: String,
      enum: [
        "ADVISORY",
        "SUBSCRIPTION_ACTIVATION",
        "SUBSCRIPTION_EXPIRY",
        "WELCOME_FARM",
      ],
      required: true,
      index: true,
    },

    referenceId: {
      type: Schema.Types.ObjectId,
      required: true,
    },

    channel: {
      type: String,
      enum: ["whatsapp", "email"],
      default: null,
    },

    templateName: {
      type: String,
      required: true,
    },

    parameters: {
      type: [String],
      default: [],
    },

    status: {
      type: String,
      enum: ["pending", "processing", "sent", "failed"],
      default: "pending",
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

    messageId: {
      type: String,
      default: null,
    },
  },
  { timestamps: true },
);

NotificationSchema.index({ status: 1, retryCount: 1 });

export default mongoose.model("Notification", NotificationSchema);
