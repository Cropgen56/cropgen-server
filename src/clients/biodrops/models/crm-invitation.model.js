import mongoose from "mongoose";

const crmInvitationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    assignmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BiodropsAdminAssignment",
      required: true,
    },
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    email: { type: String, required: true, lowercase: true, trim: true },
    level: { type: String, required: true },
    tokenHash: { type: String, required: true, unique: true, index: true },
    status: {
      type: String,
      enum: ["pending", "accepted", "expired", "cancelled"],
      default: "pending",
      index: true,
    },
    invitedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    emailSentAt: { type: Date, default: null },
    acceptedAt: { type: Date, default: null },
    loginEmailSentAt: { type: Date, default: null },
    expiresAt: { type: Date, required: true, index: true },
  },
  { timestamps: true },
);

crmInvitationSchema.index({ userId: 1, status: 1 });

const CrmInvitation =
  mongoose.models.CrmInvitation ||
  mongoose.model("CrmInvitation", crmInvitationSchema);

export default CrmInvitation;
