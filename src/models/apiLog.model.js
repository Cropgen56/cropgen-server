import mongoose from "mongoose";

const apiLogSchema = new mongoose.Schema(
  {
    method: {
      type: String,
      required: true,
    },

    endpoint: {
      type: String,
      required: true,
      index: true,
    },

    statusCode: {
      type: Number,
      required: true,
    },

    responseTime: {
      type: Number,
      required: true,
    },

    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    success: {
      type: Boolean,
      required: true,
    },

    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    versionKey: false,
  }
);

const ApiLog = mongoose.model("ApiLog", apiLogSchema);

export default ApiLog;