/**
 * Assign BioDrops super admin (one per BIODROPS tenant) to an existing user.
 *
 * Usage (from cropgen-server root):
 *   node src/clients/biodrops/scripts/seed-biodrops-super-admin.mjs user@example.com
 *   node src/clients/biodrops/scripts/seed-biodrops-super-admin.mjs +919876543210
 */
import dotenv from "dotenv";
import mongoose from "mongoose";
import { connectToDatabase } from "../../../config/db.js";
import User from "../../../models/user.model.js";
import { resolveOrganizationByCode } from "../../../utils/auth/authUtils.js";
import BiodropsAdminAssignment from "../models/admin-assignment.model.js";
import { ORGANIZATION_CODE } from "../constants.js";

dotenv.config();

const identifier = process.argv[2]?.trim();

function normalizePhone(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  if (raw.startsWith("+")) return raw;
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length === 10) return `+91${digits}`;
  return `+${digits}`;
}

if (!identifier) {
  console.error(`
Usage: node src/clients/biodrops/scripts/seed-biodrops-super-admin.mjs <email-or-phone>

Examples:
  node src/clients/biodrops/scripts/seed-biodrops-super-admin.mjs you@company.com
  node src/clients/biodrops/scripts/seed-biodrops-super-admin.mjs +919876543210
  node src/clients/biodrops/scripts/seed-biodrops-super-admin.mjs 9876543210

The user must already exist in MongoDB (e.g. after logging into SatAgro CRM once).
Run this from the cropgen-server directory (you are already there if your prompt ends with cropgen-server %).
`.trim());
  process.exit(1);
}

await connectToDatabase();

const { org } = await resolveOrganizationByCode(ORGANIZATION_CODE);

const isEmail = identifier.includes("@");
const phone = isEmail ? null : normalizePhone(identifier);
const email = isEmail ? identifier.toLowerCase() : null;

const user = isEmail
  ? await User.findOne({ email })
  : await User.findOne({ phone });

if (!user) {
  console.error(
    "User not found. Log in to the CRM once with that",
    isEmail ? "email" : "phone",
    "so the account exists, then run this script again.\n  Lookup:",
    isEmail ? email : phone,
  );
  process.exit(1);
}

const existing = await BiodropsAdminAssignment.findOne({
  level: "super",
  tenantId: org._id,
  status: "active",
});
if (existing && String(existing.userId) !== String(user._id)) {
  console.error(
    "Another BioDrops super admin already exists:",
    existing.userId.toString(),
  );
  process.exit(1);
}

await BiodropsAdminAssignment.findOneAndUpdate(
  { userId: user._id, level: "super", tenantId: org._id },
  {
    userId: user._id,
    level: "super",
    tenantId: org._id,
    countryCode: null,
    stateCode: null,
    districtCode: null,
    managedOrganizationId: null,
    status: "active",
  },
  { upsert: true, new: true },
);

user.organization = org._id;
if (user.role === "farmer") user.role = "staff";
await user.save();

const label = user.email || user.phone || user._id.toString();
console.log("BioDrops super admin assigned to", label, `(${user._id})`);
await mongoose.disconnect();
