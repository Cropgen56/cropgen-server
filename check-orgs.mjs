import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();
await mongoose.connect(process.env.MONGO_URI);

const Organization = mongoose.model("Organization", new mongoose.Schema({}, { strict: false }), "organizations");
const orgs = await Organization.find({ organizationCode: { $regex: /biodrops/i } }).lean();
console.log("Orgs matching 'biodrops' (case-insensitive):", orgs.length);
for (const o of orgs) {
  console.log(JSON.stringify({ id: String(o._id), code: o.organizationCode, name: o.organizationName }));
}

const User = mongoose.model("User", new mongoose.Schema({}, { strict: false }), "users");
for (const o of orgs) {
  const count = await User.countDocuments({ organization: o._id, deletedAt: null });
  console.log(`Users under org ${o.organizationCode} (${o._id}):`, count);
}

await mongoose.disconnect();
