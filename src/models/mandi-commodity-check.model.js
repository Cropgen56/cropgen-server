import mongoose from "mongoose";

const { Schema } = mongoose;

/**
 * The outcome of the last "does the government feed have prices for this
 * commodity?" check, so the traded-crops list can be built without calling
 * data.gov.in again for every request.
 */
const MandiCommodityCheckSchema = new Schema(
  {
    /** Lower-cased commodity name, same key as MandiPrice.commodityKey. */
    commodityKey: { type: String, required: true, unique: true },
    hasData: { type: Boolean, required: true },
    checkedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

const MandiCommodityCheck =
  mongoose.models.MandiCommodityCheck ||
  mongoose.model("MandiCommodityCheck", MandiCommodityCheckSchema);

export default MandiCommodityCheck;
