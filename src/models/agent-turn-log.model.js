import mongoose from "mongoose";

/** One row per agent reply — for finding hallucinated numbers, repeated asks and unsafe advice. */
const agentTurnLogSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true, default: null },
    channel: { type: String, enum: ["app", "whatsapp", "public"], default: "app" },
    organizationCode: String,
    farmerState: String, // NO_FARM | FARM_INCOMPLETE | FARM_COMPLETE
    profileMissing: [String],
    farmMissing: [String],
    userMessage: String,
    reply: String,
    tools: [
      {
        _id: false,
        name: String,
        args: String,
        found: Boolean,
        recordIds: [String],
        saved: Boolean,
      },
    ],
    flags: { type: [String], index: true },
    askedQuestions: Number,
    usedRecovery: Boolean,
    model: String,
    latencyMs: Number,
    totalTokens: Number,
    error: String,
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

agentTurnLogSchema.index({ createdAt: -1 });
// keep 180 days
agentTurnLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 180 * 24 * 3600 });

const AgentTurnLog =
  mongoose.models.AgentTurnLog || mongoose.model("AgentTurnLog", agentTurnLogSchema);
export default AgentTurnLog;
