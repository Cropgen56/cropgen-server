import mongoose from "mongoose";

export const KNOWLEDGE_TOPICS = [
  "planting", "variety", "seed_rate", "spacing", "nutrient", "irrigation",
  "weed", "pest", "disease", "harvest", "soil", "weather_risk",
];

/**
 * Sourced agronomy guidance (AI Agronomy Intelligence Spec §5).
 * Only `status: "approved"` records are ever served to the agent.
 */
const knowledgeRecordSchema = new mongoose.Schema(
  {
    recordId: { type: String, required: true, unique: true, trim: true },
    crop: { type: String, required: true, trim: true, index: true }, // canonical lower-case name or "ALL"
    region: {
      country: { type: String, default: "India" },
      state: { type: String, default: "ALL" }, // "ALL" only when guidance is genuinely general
      district: { type: String, default: "ALL" },
      // Multi-district zones (e.g. Marathwada): applies only if farmer's district is in this list
      districts: { type: [String], default: [] },
    },
    topic: { type: String, required: true, enum: KNOWLEDGE_TOPICS, index: true },
    growthStage: { type: String, default: "ALL" },
    recommendation: { type: String, required: true },
    conditions: { type: String, default: "" },
    numericValue: { type: Number, default: null },
    numericValueMax: { type: Number, default: null }, // upper end when the source gives a range
    numericUnit: { type: String, default: null },
    calculationBasis: { type: String, default: null }, // per acre / per hectare / per plant / per litre
    source: {
      publisher: { type: String, required: true },
      title: { type: String, required: true },
      url: { type: String, default: "" },
      documentId: { type: String, default: "" },
      yearOrVersion: { type: String, required: true },
      pageOrSection: { type: String, default: "" },
    },
    reviewedOn: { type: Date, required: true },
    confidence: { type: String, enum: ["high", "medium", "low"], default: "medium" },
    contraindications: { type: String, default: "" },
    requiredInputs: [{ type: String }],
    reviewNotes: { type: String, default: "" }, // open questions for the agronomist reviewer
    // draft = imported but not agronomist-reviewed; never retrieved
    status: { type: String, enum: ["draft", "approved", "retired"], default: "draft", index: true },
  },
  { timestamps: true },
);

knowledgeRecordSchema.index({ crop: 1, topic: 1, status: 1 });
knowledgeRecordSchema.index({ "region.state": 1, "region.district": 1 });
// A numeric value must always carry its unit and basis.
knowledgeRecordSchema.pre("validate", function (next) {
  if (this.numericValue != null && (!this.numericUnit || !this.calculationBasis)) {
    return next(new Error("numericValue requires numericUnit and calculationBasis"));
  }
  next();
});

const KnowledgeRecord =
  mongoose.models.KnowledgeRecord ||
  mongoose.model("KnowledgeRecord", knowledgeRecordSchema);

export default KnowledgeRecord;
