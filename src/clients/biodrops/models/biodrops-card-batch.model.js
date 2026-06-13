import mongoose from "mongoose";

const BiodropsCardBatchSchema = new mongoose.Schema(
  {
    label: { type: String, required: true, trim: true },
    productSku: { type: String, default: null },
    productName: { type: String, default: null },
    acreLimit: { type: Number, required: true, min: 0.1 },
    durationMonths: { type: Number, enum: [6, 12], required: true },
    quantity: { type: Number, required: true, min: 1 },
    redeemBy: { type: Date, default: null },
    notes: { type: String, default: null },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true },
);

const BiodropsCardBatch =
  mongoose.models.BiodropsCardBatch ||
  mongoose.model("BiodropsCardBatch", BiodropsCardBatchSchema);

export default BiodropsCardBatch;
