import mongoose from "mongoose";
const { Schema } = mongoose;

const ActivitySchema = new Schema(
  {
    type: {
      type: String,
      enum: [
        "SPRAY",
        "FERTIGATION",
        "IRRIGATION",
        "WEATHER",
        "CROP_RISK",
        "MONITORING",
        "CARBON_TRACKING",
      ],
      required: true,
    },
    title: {
      type: String,
      required: true,
    },
    message: {
      type: String,
      required: true,
    },
    details: {
      type: Schema.Types.Mixed,
      default: {},
    },
    /** Farmer tracking: started → in_progress → completed (null until farmer sets) */
    progress: {
      type: String,
      enum: ["started", "in_progress", "completed", null],
      default: null,
    },
    completedAt: {
      type: Date,
      default: null,
    },
  },
  { _id: false },
);

const FarmAdvisorySchema = new Schema(
  {
    farmFieldId: {
      type: Schema.Types.ObjectId,
      ref: "FarmField",
      required: true,
    },
    /** Which crop instance this advisory is for (multi-crop). Null for
     * barren-land advisories and any pre-migration legacy docs. */
    cropInstanceId: {
      type: Schema.Types.ObjectId,
      ref: "FieldCrop",
      default: null,
      index: true,
    },
    activitiesToDo: {
      type: [ActivitySchema],
      default: [],
    },
    cropHealth: {
      score: Number,
      percentage: Number,
      category: String,
      recommendation: String,
    },
    yield: {
      standardYield: Number,
      aiYield: Number,
      unit: {
        type: String,
        enum: ["tons", "quintal"],
        default: "quintal",
      },
      explanation: String,
    },
    plantGrowthActivity: {
      bbchStage: Number,
      stageName: String,
      description: String,
      cumulativeGDD: Number,
      overallProgress: Number,
      stageProgress: Number,
      cropAgeDays: Number,
      stageConfidence: Number,
      stageFusionMethod: String,
      gddSource: String,
      ndviPhenologyPhase: String,
      signals: Schema.Types.Mixed,
    },
    npkManagement: Schema.Types.Mixed,
    carbonData: {
      emissionKgCO2: Number,
      capturedKgCO2: Number,
      netBalanceKgCO2: Number,
    },
    recommendedProducts: {
      type: [
        new Schema(
          {
            productName: { type: String, required: true },
            productImageUrl: { type: String, required: true },
            productSourceUrl: { type: String, default: null },
            description: { type: String, default: null },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
    /** Compact `/calculate/index` summaries (legend stats only; no base64 images). */
    opticalIndicesSummary: { type: Schema.Types.Mixed, default: null },
    /** Weather at generation time — used by cron to detect significant changes. */
    weatherSnapshot: { type: Schema.Types.Mixed, default: null },
    /** Farmer language the advisory text was generated in (e.g. "mr"). */
    language: { type: String, default: null },
    /** How activities were produced: engine (workbook rules) | llm | rules | hybrid */
    activitiesSource: {
      type: String,
      enum: ["engine", "llm", "rules", "hybrid"],
      default: "rules",
    },
    /** Rules engine run metadata: mode, rulesVersion, country, dataQuality flags… */
    engine: { type: Schema.Types.Mixed, default: null },
    /** Structured engine decisions (spray / irrigation / fertilizer) with rule ids — for audit and history. */
    decisions: { type: Schema.Types.Mixed, default: null },
    /** Alerts fired on this run: { alertId, severity, vars, sentAt, whatsapp } (drives cooldowns). */
    alerts: { type: [Schema.Types.Mixed], default: [] },
    /** Exact WhatsApp texts the engine produced (daily / alerts / fertilizer). */
    whatsappPreview: { type: Schema.Types.Mixed, default: null },
    /** Shadow mode only: what the engine would have said (not sent to farmers). */
    engineShadow: { type: Schema.Types.Mixed, default: null },
    /** Operations created on the farm calendar from activitiesToDo */
    linkedOperationIds: {
      type: [{ type: Schema.Types.ObjectId, ref: "Operation" }],
      default: [],
    },
  },
  { timestamps: true },
);

FarmAdvisorySchema.index({ farmFieldId: 1 });
FarmAdvisorySchema.index({ farmFieldId: 1, cropInstanceId: 1, createdAt: -1 });
FarmAdvisorySchema.index({ createdAt: -1 });

export default mongoose.model("FarmAdvisory", FarmAdvisorySchema);
