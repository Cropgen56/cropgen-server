import mongoose from "mongoose";

const BiodropsProductCardSchema = new mongoose.Schema(
  {
    batchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BiodropsCardBatch",
      required: true,
      index: true,
    },
    codeHash: { type: String, required: true, unique: true, index: true },
    codePrefix: { type: String, required: true },
    acreLimit: { type: Number, required: true, min: 0.1 },
    durationMonths: { type: Number, enum: [6, 12], required: true },
    status: {
      type: String,
      enum: ["unused", "redeemed", "revoked", "expired"],
      default: "unused",
      index: true,
    },
    redeemBy: { type: Date, default: null },
    redeemedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    redeemedAt: { type: Date, default: null },
    revokedAt: { type: Date, default: null },
    revokedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    revokeReason: { type: String, default: null },
  },
  { timestamps: true },
);

BiodropsProductCardSchema.index({ batchId: 1, status: 1 });

const BiodropsProductCard =
  mongoose.models.BiodropsProductCard ||
  mongoose.model("BiodropsProductCard", BiodropsProductCardSchema);

export default BiodropsProductCard;
