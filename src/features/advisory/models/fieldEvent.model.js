import mongoose from "mongoose";
const { Schema } = mongoose;

/**
 * A detected field condition (vigour drop, water stress, waterlogging, pest risk,
 * new stage, weather alert…). Drives the app popup feed and WhatsApp alerts.
 *
 * Lifecycle: open → acknowledged (farmer tapped "seen") → resolved
 * (condition cleared, expired, or farmer/agronomist closed it).
 */
const EvidenceSchema = new Schema(
  {
    source: String, // Sentinel-2 | Sentinel-1 | Weather forecast | Water balance | Growth model | Operations
    metric: String,
    current: Schema.Types.Mixed,
    previous: Schema.Types.Mixed,
    expected: Schema.Types.Mixed,
    date: String,
    previousDate: String,
  },
  { _id: false, strict: false },
);

const FieldEventSchema = new Schema(
  {
    farmFieldId: { type: Schema.Types.ObjectId, ref: "FarmField", required: true },
    cropInstanceId: { type: Schema.Types.ObjectId, ref: "FieldCrop", default: null },
    user: { type: Schema.Types.ObjectId, ref: "User", default: null },
    key: { type: String, required: true }, // type or type:targetId — one open event per key
    type: { type: String, required: true },
    severity: { type: String, enum: ["Info", "Low", "Medium", "High"], default: "Medium" },
    confidence: { type: Number, min: 0, max: 1, default: 0.5 },
    status: { type: String, enum: ["open", "acknowledged", "resolved"], default: "open", index: true },
    language: String,
    title: String,
    message: String,
    causes: { type: [Schema.Types.Mixed], default: [] },
    causesText: { type: [String], default: [] },
    vars: { type: Schema.Types.Mixed, default: {} },
    evidence: { type: [EvidenceSchema], default: [] },
    firstSeenAt: Date,
    lastSeenAt: Date,
    expiresAt: Date,
    lastNotifiedAt: { type: Date, default: null },
    notifiedSeverity: { type: String, default: null },
    whatsappSentAt: { type: Date, default: null },
    whatsappPending: { type: Boolean, default: false },
    acknowledgedAt: { type: Date, default: null },
    resolvedAt: { type: Date, default: null },
    resolvedReason: { type: String, default: null }, // condition_cleared | expired | farmer | agronomist
    /** Farmer / agronomist feedback: { answer: "true"|"false"|"lodging"|"harvested"|…, note, by, at } */
    feedback: { type: Schema.Types.Mixed, default: null },
    snapshotId: { type: Schema.Types.ObjectId, ref: "FieldConditionSnapshot", default: null },
    rulesVersion: String,
  },
  { timestamps: true },
);

FieldEventSchema.index({ farmFieldId: 1, cropInstanceId: 1, status: 1, key: 1 });
FieldEventSchema.index({ farmFieldId: 1, whatsappSentAt: -1 });
FieldEventSchema.index({ user: 1, status: 1, lastSeenAt: -1 });

export default mongoose.models.FieldEvent || mongoose.model("FieldEvent", FieldEventSchema);
