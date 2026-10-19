import mongoose from "mongoose";

const userChatSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      refPath: "userType",
    },
    userType: {
      type: String,
      required: true,
      enum: ["Farmer", "Organization"],
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

const Chathistory =
  mongoose.models.UserChat ||
  mongoose.model("UserChat", userChatSchema);

export default Chathistory;
