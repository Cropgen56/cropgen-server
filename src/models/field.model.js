import mongoose from "mongoose";

const farmFieldSchema = new mongoose.Schema(
  {
    field: {
      type: [
        {
          lat: { type: Number, required: true },
          lng: { type: Number, required: true },
        },
      ],
      required: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    fieldName: { type: String, required: true },
    cropName: { type: String, required: true },
    variety: { type: String, required: true },
    sowingDate: { type: String, required: true },
    acre: { type: Number, required: true },
    typeOfIrrigation: { type: String, required: true },
    typeOfFarming: {
      type: String,
      enum: ["Organic", "Inorganic", "Integrated"],
      required: true,
    },
    /** True when the plot has no standing crop; sowingDate stores expected sowing date. */
    isBarrenLand: { type: Boolean, default: false },
  },
  { timestamps: true }
);

farmFieldSchema.index({ createdAt: 1 });
farmFieldSchema.index({ user: 1 });
farmFieldSchema.index({ cropName: 1 });
farmFieldSchema.index({ typeOfFarming: 1 });
farmFieldSchema.index({ typeOfIrrigation: 1 });

export default mongoose.model("FarmField", farmFieldSchema);