import mongoose from "mongoose";

const GLOBAL_SETTINGS_ID = "global";

const whatsappSettingsSchema = new mongoose.Schema(
  {
    _id: {
      type: String,
      required: true,
    },
    replyMode: {
      type: String,
      enum: ["automation", "manual"],
      default: "automation",
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true },
);

whatsappSettingsSchema.statics.GLOBAL_ID = GLOBAL_SETTINGS_ID;

export default mongoose.model("WhatsAppSettings", whatsappSettingsSchema);
