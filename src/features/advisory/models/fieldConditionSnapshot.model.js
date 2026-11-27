import mongoose from "mongoose";
const { Schema } = mongoose;

/**
 * One condition snapshot per monitor run: what the field looked like (satellite,
 * stage, water, pest risk). The next run compares against the latest one.
 * Old snapshots expire automatically (TTL) to bound storage.
 */
const FieldConditionSnapshotSchema = new Schema(
  {
    farmFieldId: { type: Schema.Types.ObjectId, ref: "FarmField", required: true },
    cropInstanceId: { type: Schema.Types.ObjectId, ref: "FieldCrop", default: null },
    trigger: { type: String, default: "daily" }, // daily | weather | satellite | operation | advisory | manual
    date: { type: String, required: true }, // YYYY-MM-DD
    monitorVersion: String,
    rulesVersion: String,
    /** Output of rules-engine/monitor buildConditionSnapshot (signals, stage, water, pest, flags). */
    snapshot: { type: Schema.Types.Mixed, required: true },
    /** Recent satellite points kept so weather-only runs can reuse them without refetching. */
    satelliteSeries: { type: Schema.Types.Mixed, default: null },
    /** Last Sentinel-2 / Sentinel-1 scene dates processed (drives "new scene" detection). */
    lastS2SceneDate: { type: String, default: null },
    lastS1SceneDate: { type: String, default: null },
    evaluated: { type: Schema.Types.Mixed, default: null },
    eventKeys: { type: [String], default: [] },
  },
  { timestamps: true },
);

const RETENTION_DAYS = Number(process.env.MONITOR_SNAPSHOT_RETENTION_DAYS) || 400;

FieldConditionSnapshotSchema.index({ farmFieldId: 1, cropInstanceId: 1, createdAt: -1 });
FieldConditionSnapshotSchema.index({ createdAt: 1 }, { expireAfterSeconds: RETENTION_DAYS * 86400 });

export default mongoose.models.FieldConditionSnapshot ||
  mongoose.model("FieldConditionSnapshot", FieldConditionSnapshotSchema);
