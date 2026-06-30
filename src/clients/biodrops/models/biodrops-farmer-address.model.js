import mongoose from "mongoose";

const BiodropsFarmerAddressSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    label: { type: String, default: "", trim: true },
    name: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
    line1: { type: String, required: true, trim: true },
    line2: { type: String, default: "" },
    city: { type: String, required: true, trim: true },
    state: { type: String, required: true, trim: true },
    pincode: { type: String, required: true, trim: true },
    country: { type: String, default: "IN", trim: true },
    isDefault: { type: Boolean, default: false },
  },
  { timestamps: true },
);

BiodropsFarmerAddressSchema.index({ userId: 1, isDefault: 1 });

export default mongoose.model(
  "BiodropsFarmerAddress",
  BiodropsFarmerAddressSchema,
);
