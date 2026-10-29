import mongoose from "mongoose";

/** Ledger of credits drawn from a client's pools, one row per farm per pool. */
const BiodropsClientCreditTransactionSchema = new mongoose.Schema(
  {
    clientOrganization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    purchaseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BiodropsClientCreditPurchase",
      required: true,
      index: true,
    },
    /** farm_activation = new farm; area_increase = farm boundary grew. */
    reason: {
      type: String,
      enum: ["farm_activation", "area_increase"],
      required: true,
    },
    credits: { type: Number, required: true, min: 0 },

    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    fieldId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "FarmField",
      required: true,
    },
    /** Copied so the ledger stays readable after a farm is deleted. */
    fieldName: { type: String, default: "" },
    fieldAcres: { type: Number, default: 0 },
    subscriptionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "UserSubscription",
      default: null,
    },
  },
  { timestamps: true },
);

BiodropsClientCreditTransactionSchema.index({
  clientOrganization: 1,
  createdAt: -1,
});

const BiodropsClientCreditTransaction =
  mongoose.models.BiodropsClientCreditTransaction ||
  mongoose.model(
    "BiodropsClientCreditTransaction",
    BiodropsClientCreditTransactionSchema,
  );

export default BiodropsClientCreditTransaction;
