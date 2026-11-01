import mongoose from "mongoose";
import Organization from "../../../models/organization.model.js";
import { ORGANIZATION_CODE } from "../constants.js";
import { resolveOrganizationByCode } from "../../../utils/auth/authUtils.js";

const CODE_PREFIX = "BD-";
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_PATTERN = /^[A-Z0-9][A-Z0-9-]{2,23}$/;

export function normalizeClientCode(value) {
  return String(value || "").trim().toUpperCase();
}

export function isValidClientCodeFormat(code) {
  return CODE_PATTERN.test(normalizeClientCode(code));
}

function randomCode() {
  let out = "";
  for (let i = 0; i < 6; i += 1) {
    out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return `${CODE_PREFIX}${out}`;
}

/** Unused BD-XXXXXX code (organizationCode is globally unique across all orgs). */
export async function generateUniqueClientCode() {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const code = randomCode();
    if (!(await Organization.exists({ organizationCode: code }))) return code;
  }
  throw new Error("Could not generate a unique organization code.");
}

/**
 * A staff account with a client org and no admin assignment is a client's
 * read-only CRM login. Assignments win: a BioDrops admin is never a viewer.
 */
export function isClientViewer(actor) {
  return (
    actor?.role === "staff" &&
    !!actor.clientOrganization &&
    // An upgraded client farmer is staff + clientOrganization too; without
    // this, suspending their assignment would hand them the client's login.
    actor.upgradedFromFarmer !== true &&
    !(actor.adminAssignments || []).length
  );
}

/** Mongo filter: the farmers of a client, including ones upgraded to CRM staff. */
export const FARMER_ACCOUNT_FILTER = {
  $or: [{ role: "farmer" }, { upgradedFromFarmer: true }],
};

/** A farmer account for farm/credit purposes (still true after upgrade to staff). */
export function isFarmerAccount(user) {
  return user?.role === "farmer" || user?.upgradedFromFarmer === true;
}

/**
 * A client organization's own login account (not one of its farmers).
 * It must never become CRM staff: an admin assignment would turn the
 * client's login into a BioDrops admin and the client would lose it.
 */
export function isClientLoginAccount(user) {
  return !!user?.clientOrganization && !isFarmerAccount(user);
}

/** Active client org under BIODROPS for a signup code, or null. */
export async function findActiveClientByCode(rawCode) {
  const code = normalizeClientCode(rawCode);
  if (!code || !isValidClientCodeFormat(code)) return null;
  const { org: biodrops } = await resolveOrganizationByCode(ORGANIZATION_CODE);
  return Organization.findOne({
    organizationCode: code,
    parentOrganization: biodrops._id,
    status: "active",
  }).lean();
}

/** Client org under BIODROPS by id (any status), or null. */
export async function findClientById(id) {
  if (!mongoose.Types.ObjectId.isValid(id)) return null;
  const { org: biodrops } = await resolveOrganizationByCode(ORGANIZATION_CODE);
  return Organization.findOne({ _id: id, parentOrganization: biodrops._id });
}

export function formatClientOrg(org, extra = {}) {
  if (!org) return null;
  return {
    id: String(org._id),
    organizationName: org.organizationName,
    organizationCode: org.organizationCode,
    email: org.email || null,
    phoneNumber: org.phoneNumber || null,
    address: org.address || null,
    status: org.status || "active",
    createdAt: org.createdAt || null,
    ...extra,
  };
}
