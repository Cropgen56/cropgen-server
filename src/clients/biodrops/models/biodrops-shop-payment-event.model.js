import mongoose from "mongoose";

const BiodropsShopPaymentEventSchema = new mongoose.Schema(
  {
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BiodropsOrder",
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      index: true,
    },
    orderNumber: { type: String, default: null, index: true },
    razorpayEventId: { type: String, required: true, unique: true },
    eventType: { type: String, required: true, index: true },
    razorpayPaymentId: { type: String, default: null, index: true },
    razorpayOrderId: { type: String, default: null, index: true },
    refundId: { type: String, default: null },
    amountMinor: { type: Number, default: null },
    currency: { type: String, default: "INR" },
    status: {
      type: String,
      enum: ["captured", "refunded", "failed", "pending"],
      default: "captured",
      index: true,
    },
    payloadSummary: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { timestamps: true },
);

BiodropsShopPaymentEventSchema.index({ createdAt: -1 });

const BiodropsShopPaymentEvent =
  mongoose.models.BiodropsShopPaymentEvent ||
  mongoose.model("BiodropsShopPaymentEvent", BiodropsShopPaymentEventSchema);

export default BiodropsShopPaymentEvent;
