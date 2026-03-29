import mongoose from "mongoose";

const { Schema } = mongoose;

const SubscriptionBillingEventSchema = new Schema(
  {
    userSubscriptionId: {
      type: Schema.Types.ObjectId,
      ref: "UserSubscription",
      index: true,
    },
    userId: { type: Schema.Types.ObjectId, ref: "User", index: true },
    fieldId: { type: Schema.Types.ObjectId, ref: "FarmField" },

    razorpayEventId: { type: String, required: true, unique: true },
    eventType: { type: String, required: true, index: true },

    razorpayInvoiceId: { type: String, default: null },
    razorpayPaymentId: { type: String, default: null },
    razorpaySubscriptionId: { type: String, default: null, index: true },

    amountMinor: { type: Number, default: null },
    currency: { type: String, default: null },

    payloadSummary: { type: Schema.Types.Mixed, default: null },
  },
  { timestamps: true },
);

SubscriptionBillingEventSchema.index({ createdAt: -1 });

const SubscriptionBillingEvent =
  mongoose.models.SubscriptionBillingEvent ||
  mongoose.model("SubscriptionBillingEvent", SubscriptionBillingEventSchema);

export default SubscriptionBillingEvent;
