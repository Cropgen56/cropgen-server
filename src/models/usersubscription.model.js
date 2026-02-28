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
    expiryReminder: {
      isSent: { type: Boolean, default: false },
      retryCount: { type: Number, default: 0 },
      status: {
        type: String,
        enum: ["pending", "processing", "sent", "failed"],
        default: "pending",
      },
      error: { type: String, default: null },
    },
  },
  { timestamps: true },
);

/* ===========================================================
   🔐 UNIQUE TRIAL PROTECTION (DATABASE LEVEL)
   One trial per user per field
=========================================================== */

UserSubscriptionSchema.index(
  { fieldId: 1, billingCycle: 1 },
  {
    unique: true,
    partialFilterExpression: { billingCycle: "trial" },
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
