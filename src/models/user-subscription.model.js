import mongoose from "mongoose";

const { Schema } = mongoose;

const UserSubscriptionSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    fieldId: {
      type: Schema.Types.ObjectId,
      ref: "FarmField",
      required: true,
      index: true,
    },

    planId: {
      type: Schema.Types.ObjectId,
      ref: "SubscriptionPlan",
      required: true,
      index: true,
    },

    platform: {
      type: String,
      enum: ["mobile", "web"],
      required: true,
    },

    area: {
      type: Number,
      min: 0,
      required: true,
    },

    unit: {
      type: String,
      enum: ["acre"],
      default: "acre",
    },

    billingCycle: {
      type: String,
      enum: ["trial", "monthly", "yearly", "season"],
      required: true,
    },

    /** After trial: monthly | yearly | season (web + mandate flows). */
    commitBillingCycle: {
      type: String,
      enum: ["monthly", "yearly", "season"],
      default: null,
    },

    displayCurrency: {
      type: String,
      enum: ["INR", "USD"],
    },

    pricePerUnitMinor: {
      type: Number,
      required: true,
    },

    totalAmountMinor: {
      type: Number,
      required: true,
    },

    chargedCurrency: {
      type: String,
      enum: ["INR"],
      default: "INR",
    },

    exchangeRate: {
      type: Number,
      default: null,
    },

    status: {
      type: String,
      enum: ["pending", "active", "expired", "cancelled"],
      default: "pending",
      index: true,
    },

    activatedByAdmin: {
      type: Boolean,
      default: false,
    },

    activatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    startDate: { type: Date, default: Date.now },
    endDate: { type: Date, default: null },

    razorpayOrderId: { type: String, default: null },
    razorpayPaymentId: { type: String, default: null },
    razorpaySignature: { type: String, default: null },

    razorpaySubscriptionId: { type: String, default: null, index: true },
    razorpayPlanId: { type: String, default: null },

    postTrialPlanId: {
      type: Schema.Types.ObjectId,
      ref: "SubscriptionPlan",
      default: null,
    },
    paymentMethodCapturedAt: { type: Date, default: null },
    trialEndsAt: { type: Date, default: null },

    termStart: { type: Date, default: null },
    termEnd: { type: Date, default: null },
    currentPeriodStart: { type: Date, default: null },
    currentPeriodEnd: { type: Date, default: null },

    billingPattern: {
      type: String,
      default: null,
    },

    billingMode: {
      type: String,
      enum: ["legacy_order", "recurring"],
      default: "legacy_order",
    },

    subscriptionPhase: {
      type: String,
      enum: [
        "trial",
        "trial_verification_pending",
        "trial_enrollment_pending",
        "trial_mandate_pending",
        "trial_mandate_saved",
        "active_paid",
        "card_remainder_pending",
        "card_payment_pending",
      ],
      default: null,
    },

    activationSource: {
      type: String,
      enum: ["razorpay", "product_card", "hybrid", "admin", "demo_key"],
      default: "razorpay",
    },

    cardAcres: { type: Number, default: 0 },
    paidAcres: { type: Number, default: 0 },
    /** Acres from product card still awaiting CRM admin approval (hybrid flow). */
    pendingAdminAcres: { type: Number, default: 0 },

    entitlementId: {
      type: Schema.Types.ObjectId,
      ref: "BiodropsAcreEntitlement",
      default: null,
    },

    sourceCardId: {
      type: Schema.Types.ObjectId,
      ref: "BiodropsProductCard",
      default: null,
    },
  },
  { timestamps: true },
);

/* ===========================================================
   UNIQUE TRIAL PER FIELD (DATABASE LEVEL)
   At most one trial row per user per farm. Drop legacy index
   userId_1_billingCycle_1 on upgrade if migrations fail.
=========================================================== */

UserSubscriptionSchema.index(
  { userId: 1, fieldId: 1, billingCycle: 1 },
  {
    unique: true,
    partialFilterExpression: {
      billingCycle: "trial",
      status: { $in: ["active", "pending"] },
    },
  },
);

/* ===========================================================
   🚀 PERFORMANCE INDEX FOR EXPIRY CRON
=========================================================== */

UserSubscriptionSchema.index({ status: 1, endDate: 1 });

const UserSubscription =
  mongoose.models.UserSubscription ||
  mongoose.model("UserSubscription", UserSubscriptionSchema);

export default UserSubscription;
