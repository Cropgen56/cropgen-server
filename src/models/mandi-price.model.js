import mongoose from "mongoose";

const { Schema } = mongoose;

/**
 * One market's price for one commodity on one arrival date, as published by
 * data.gov.in (Agmarknet). The original API record is kept untouched in `data`
 * (the app reads that shape); the other fields exist for lookups.
 */
const MandiPriceSchema = new Schema(
  {
    /** Lower-cased commodity name used for the lookup (e.g. "tomato"). */
    commodityKey: { type: String, required: true, index: true },
    state: { type: String, default: "" },
    district: { type: String, default: "" },
    market: { type: String, default: "" },
    variety: { type: String, default: "" },
    grade: { type: String, default: "" },
    /** Arrival date at UTC midnight (the API gives dd/mm/yyyy). */
    arrivalDate: { type: Date, required: true },
    data: { type: Schema.Types.Mixed, required: true },
    fetchedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

// A market/variety/grade has one price per day; re-fetching updates it.
MandiPriceSchema.index(
  { commodityKey: 1, state: 1, district: 1, market: 1, variety: 1, grade: 1, arrivalDate: 1 },
  { unique: true },
);
MandiPriceSchema.index({ commodityKey: 1, arrivalDate: -1 });

const MandiPrice =
  mongoose.models.MandiPrice || mongoose.model("MandiPrice", MandiPriceSchema);

export default MandiPrice;
