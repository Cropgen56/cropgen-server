import mongoose from "mongoose";

const BiodropsAcreEntitlementSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    sourceCardId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BiodropsProductCard",
      required: true,
    },
    totalAcres: { type: Number, required: true, min: 0 },
    usedAcres: { type: Number, default: 0, min: 0 },
    validUntil: { type: Date, required: true },
    status: {
      type: String,
      enum: ["active", "exhausted", "expired"],
      default: "active",
      index: true,
    },
  },
  { timestamps: true },
);

BiodropsAcreEntitlementSchema.index({ userId: 1, status: 1 });

const BiodropsAcreEntitlement =
  mongoose.models.BiodropsAcreEntitlement ||
  mongoose.model("BiodropsAcreEntitlement", BiodropsAcreEntitlementSchema);

export default BiodropsAcreEntitlement;
