import mongoose from "mongoose";

const ProductImageSchema = new mongoose.Schema(
  {
    url: { type: String, required: true, trim: true },
    alt: { type: String, default: "" },
  },
  { _id: false },
);

const BiodropsProductSchema = new mongoose.Schema(
  {
    sku: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    tagline: { type: String, default: "" },
    images: { type: [ProductImageSchema], default: [] },
    priceMinor: { type: Number, required: true, min: 0 },
    currency: {
      type: String,
      enum: ["INR"],
      default: "INR",
      uppercase: true,
    },
    unit: {
      type: String,
      enum: ["per_liter", "per_kg", "per_unit", "per_acre"],
      default: "per_unit",
    },
    category: {
      type: String,
      enum: [
        "biofertilizer",
        "compost",
        "fungicide",
        "disease_control",
        "other",
      ],
      default: "other",
    },
    stockQuantity: { type: Number, default: null, min: 0 },
    lowStockThreshold: { type: Number, default: null, min: 0 },
    weightGrams: { type: Number, default: null, min: 0 },
    status: {
      type: String,
      enum: ["draft", "active", "archived"],
      default: "draft",
      index: true,
    },
    applicationMethod: { type: String, default: "" },
    sortOrder: { type: Number, default: 0 },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true },
);

BiodropsProductSchema.index({ status: 1, sortOrder: 1 });

const BiodropsProduct =
  mongoose.models.BiodropsProduct ||
  mongoose.model("BiodropsProduct", BiodropsProductSchema);

export default BiodropsProduct;
