import mongoose from "mongoose";

const appUserChatSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    messages: [
      {
        sender: { type: String, enum: ["user", "ai"], required: true },
        text: { type: String, required: true },
        ts: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true }
);

appUserChatSchema.index({ updatedAt: -1 });

const AppUserChat =
  mongoose.models.AppUserChat ||
  mongoose.model("AppUserChat", appUserChatSchema);

export default AppUserChat;
