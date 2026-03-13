import mongoose from "mongoose";

const addressSchema = new mongoose.Schema(
  {
    city: { type: String },
    state: { type: String },
    country: { type: String },
    pincode: { type: String },
  },
  { _id: false }
);

const organizationSchema = new mongoose.Schema(
  {
    organizationName: { type: String, required: true },
    organizationCode: { type: String, required: true, unique: true },
    address: addressSchema,
    email: { type: String },
    phoneNumber: { type: String },
  },
  {
    timestamps: true,
  }
);

// Always store organizationCode in uppercase
organizationSchema.pre("save", function (next) {
  this.organizationCode = this.organizationCode.toUpperCase();
  next();
});

const Organization = mongoose.model("Organization", organizationSchema);
export default Organization;
