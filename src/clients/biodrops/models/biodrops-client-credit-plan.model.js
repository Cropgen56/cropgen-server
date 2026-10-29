import mongoose from "mongoose";

/**
 * A hectare-credit package a BioDrops client organization can buy from the
 * SatAgro CRM. 1 credit = 1 hectare of farm area. Once bought, every farm
 * added by one of the client's farmers is unlocked from the client's pool.
 */
const BiodropsClientCreditPlanSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, default: "", trim: true, maxlength: 1000 },

    totalHectares: { type: Number, required: true, min: 1 },
    pricePerHectareMinor: { type: Number, required: true, min: 0 },
    currency: { type: String, enum: ["INR"], default: "INR" },

    /** How long purchased credits (and the farms they unlock) stay valid. */
    validityMonths: { type: Number, required: true, min: 1, max: 60, default: 12 },

    /** BioDrops subscription plan whose feature flags unlocked farms get. */
    featurePlanId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SubscriptionPlan",
      required: true,
    },

    /** Null = offered to every client; otherwise only to this client. */
    clientOrganization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      default: null,
      index: true,
    },

    active: { type: Boolean, default: true, index: true },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true },
);

const BiodropsClientCreditPlan =
  mongoose.models.BiodropsClientCreditPlan ||
  mongoose.model("BiodropsClientCreditPlan", BiodropsClientCreditPlanSchema);

export default BiodropsClientCreditPlan;
