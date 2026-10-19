import mongoose from "mongoose";

const whatsappMessageSchema = new mongoose.Schema(
  {
    advisoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "FarmAdvisory",
      required: false,
    },

    farmerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    phone: {
      type: String,
      required: true,
      index: true,
    },

    direction: {
      type: String,
      enum: ["IN", "OUT"],
      required: true,
    },

    messageType: {
      type: String,
      enum: ["text", "template", "image", "audio", "document", "unknown"],
      default: "text",
    },

    text: {
      type: String,
      default: "",
    },

    /** Meta WhatsApp message id (wamid) */
    waMessageId: {
      type: String,
      index: true,
      sparse: true,
    },

    source: {
      type: String,
      enum: [
        "farmer",
        "admin_reply",
        "auto_reply",
        "agent_reply",
        "advisory_custom",
        "advisory_template",
        "system",
      ],
      default: "system",
    },

    deliveryStatus: {
      type: String,
      enum: ["pending", "sent", "delivered", "read", "failed", "received"],
      default: "pending",
    },

    /** Admin panel read receipt for inbound messages */
    readAtAdmin: {
      type: Date,
      default: null,
    },

    timestamp: {
      type: Date,
      default: Date.now,
    },

    rawPayload: {
      type: Object,
    },
  },
  { timestamps: true },
);

whatsappMessageSchema.index({ phone: 1, createdAt: -1 });
whatsappMessageSchema.index({ farmerId: 1, createdAt: -1 });
whatsappMessageSchema.index({ phone: 1, direction: 1, readAtAdmin: 1 });

export default mongoose.model("WhatsAppMessage", whatsappMessageSchema);
