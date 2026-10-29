import mongoose from "mongoose";

/**
 * One client purchase of a credit plan. Once paid it is also the credit pool
 * that farm activations draw from (usedCredits grows, never past totalCredits).
 */
const BiodropsClientCreditPurchaseSchema = new mongoose.Schema(
  {
    clientOrganization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    planId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BiodropsClientCreditPlan",
      required: true,
    },
    purchasedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    /** Plan terms at purchase time — later plan edits never change a purchase. */
    planSnapshot: {
      name: { type: String, required: true },
      totalHectares: { type: Number, required: true },
      pricePerHectareMinor: { type: Number, required: true },
      validityMonths: { type: Number, required: true },
      featurePlanId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "SubscriptionPlan",
        required: true,
      },
    },

    amountMinor: { type: Number, required: true, min: 0 },
    currency: { type: String, enum: ["INR"], default: "INR" },

    /** direct = activated on click without payment (until Razorpay is enabled). */
    paymentMethod: {
      type: String,
      enum: ["razorpay", "direct"],
      default: "razorpay",
    },
    paymentStatus: {
      type: String,
      enum: ["pending", "paid", "failed", "cancelled"],
      default: "pending",
      index: true,
    },
    razorpayOrderId: { type: String, default: null, index: true },
    razorpayPaymentId: { type: String, default: null },
    paidAt: { type: Date, default: null },

    totalCredits: { type: Number, required: true, min: 0 },
    usedCredits: { type: Number, default: 0, min: 0 },
    validFrom: { type: Date, default: null },
    validUntil: { type: Date, default: null },
  },
  { timestamps: true },
);

BiodropsClientCreditPurchaseSchema.index({
  clientOrganization: 1,
  paymentStatus: 1,
  validUntil: 1,
});

const BiodropsClientCreditPurchase =
  mongoose.models.BiodropsClientCreditPurchase ||
  mongoose.model(
    "BiodropsClientCreditPurchase",
    BiodropsClientCreditPurchaseSchema,
  );

export default BiodropsClientCreditPurchase;
