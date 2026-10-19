import mongoose from "mongoose";

const BiodropsCardEventSchema = new mongoose.Schema(
  {
    cardId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BiodropsProductCard",
      default: null,
      index: true,
    },
    batchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BiodropsCardBatch",
      default: null,
      index: true,
    },
    eventType: {
      type: String,
      enum: [
        "batch_created",
        "exported",
        "redeemed",
        "acres_allocated",
        "subscription_activated",
        "hybrid_payment",
        "revoked",
        "expired",
        "entitlement_expired",
      ],
      required: true,
    },
    actorType: {
      type: String,
      enum: ["admin", "farmer", "system"],
      default: "system",
    },
    actorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true },
);

const BiodropsCardEvent =
  mongoose.models.BiodropsCardEvent ||
  mongoose.model("BiodropsCardEvent", BiodropsCardEventSchema);

export default BiodropsCardEvent;
