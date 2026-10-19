import mongoose from "mongoose";

const OrderItemSchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BiodropsProduct",
      required: true,
    },
    sku: { type: String, required: true },
    name: { type: String, required: true },
    quantity: { type: Number, required: true, min: 1 },
    unitPriceMinor: { type: Number, required: true, min: 0 },
    lineTotalMinor: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const ShippingAddressSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
    line1: { type: String, required: true, trim: true },
    line2: { type: String, default: "" },
    city: { type: String, required: true, trim: true },
    state: { type: String, required: true, trim: true },
    pincode: { type: String, required: true, trim: true },
    country: { type: String, default: "IN", trim: true },
  },
  { _id: false },
);

const BiodropsOrderSchema = new mongoose.Schema(
  {
    orderNumber: { type: String, required: true, unique: true, index: true },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    items: { type: [OrderItemSchema], required: true },
    shippingAddress: { type: ShippingAddressSchema, required: true },
    subtotalMinor: { type: Number, required: true, min: 0 },
    shippingMinor: { type: Number, default: 0, min: 0 },
    totalMinor: { type: Number, required: true, min: 0 },
    currency: {
      type: String,
      enum: ["INR"],
      default: "INR",
      uppercase: true,
    },
    paymentStatus: {
      type: String,
      enum: ["pending", "paid", "failed", "refunded"],
      default: "pending",
      index: true,
    },
    paymentMethod: {
      type: String,
      enum: ["online", "cod"],
      default: "online",
      index: true,
    },
    fulfillmentStatus: {
      type: String,
      enum: ["pending", "confirmed", "shipped", "delivered", "cancelled"],
      default: "pending",
      index: true,
    },
    razorpayOrderId: { type: String, default: null, index: true },
    razorpayPaymentId: { type: String, default: null },
    paidAt: { type: Date, default: null },
    cancelledAt: { type: Date, default: null },
    cancelledBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    cancelReason: { type: String, default: "" },
    refundId: { type: String, default: null },
    refundedAt: { type: Date, default: null },
    notes: { type: String, default: "" },
    adminNotes: { type: String, default: "" },
  },
  { timestamps: true },
);

BiodropsOrderSchema.index({ createdAt: -1 });
BiodropsOrderSchema.index({ userId: 1, createdAt: -1 });

const BiodropsOrder =
  mongoose.models.BiodropsOrder ||
  mongoose.model("BiodropsOrder", BiodropsOrderSchema);

export default BiodropsOrder;
