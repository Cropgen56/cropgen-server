import mongoose from "mongoose";

const CartItemSchema = new mongoose.Schema(
  {
    sku: { type: String, required: true, trim: true, lowercase: true },
    quantity: { type: Number, required: true, min: 1, default: 1 },
  },
  { _id: false },
);

const BiodropsCartSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },
    items: { type: [CartItemSchema], default: [] },
  },
  { timestamps: true },
);

export default mongoose.model("BiodropsCart", BiodropsCartSchema);
