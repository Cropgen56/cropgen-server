import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();
await mongoose.connect(process.env.MONGO_URI);

const { default: BiodropsAdminAssignment } = await import("./src/clients/biodrops/models/admin-assignment.model.js");
const { resolveOrganizationByCode } = await import("./src/utils/auth/authUtils.js");
const { org } = await resolveOrganizationByCode("BIODROPS");

const userId = "6a22ab5ed77f9efa3c612538"; // Satagro Admin

const existing = await BiodropsAdminAssignment.findOne({ userId, status: "active" });
console.log("Existing active assignment:", existing ? JSON.stringify(existing.toObject()) : null);

if (existing) {
  existing.status = "suspended";
  await existing.save();
  console.log("Suspended the state-level assignment.");
}

const activeSuperCount = await BiodropsAdminAssignment.countDocuments({ tenantId: org._id, level: "super", status: "active" });
console.log("Active super admins before promotion:", activeSuperCount);

const created = await BiodropsAdminAssignment.create({
  userId,
  level: "super",
  tenantId: org._id,
  countryCode: null,
  stateCode: null,
  districtCode: null,
  managedOrganizationId: null,
  appointedBy: existing?.appointedBy || null,
  status: "active",
});
console.log("Created super assignment:", JSON.stringify(created.toObject()));

await mongoose.disconnect();
