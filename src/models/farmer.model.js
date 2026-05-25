import mongoose from "mongoose";

const farmerSchema = new mongoose.Schema({
  name: { type: String, required: true },
  contact: { type: String, required: true },
});

const Farmer =
  mongoose.models.Farmer ||
  mongoose.model("Farmer", farmerSchema);

export default Farmer;
