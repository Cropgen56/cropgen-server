import User from "../../../../models/user.model.js";
import { resolveCrmUserBaseQuery } from "../../utils/crmUserQuery.js";
import { normalizeCrmPhone } from "../../utils/crmUserManage.js";
import { findClientById } from "../../utils/clientOrg.js";
import { buildFarmerRoleQuery } from "./list-farmers.controller.js";
import { getBiodropsFarmerById } from "./get-farmer-by-id.controller.js";

const EMAIL_OK = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_OK = /^\+\d{8,15}$/;

/** Profile fields a CRM admin may edit, with their max lengths (model limits). */
const TEXT_FIELDS = {
  firstName: 50,
  lastName: 50,
  city: 100,
  village: 100,
  district: 32,
  state: 10,
  country: 3,
  pincode: 10,
};

function fail(res, status, message) {
  return res.status(status).json({ success: false, message });
}

function badInput(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

/**
 * Apply profile fields from `body` to `user` (only keys present change; ""
 * clears an optional one). Throws {status, message} on invalid input. Phone
 * and email are unique per organization, so `user.organization` must be set.
 */
async function applyFarmerProfile(user, body = {}) {
  const has = (key) => body[key] !== undefined;

  for (const [key, max] of Object.entries(TEXT_FIELDS)) {
    if (!has(key)) continue;
    const value = String(body[key] ?? "").trim();
    if (value.length > max) {
      throw badInput(400, `${key} must be at most ${max} characters.`);
    }
    user[key] = value || null;
  }
  if (has("firstName") && !user.firstName) {
    throw badInput(400, "First name is required.");
  }

  if (has("email")) {
    const email = String(body.email ?? "").trim().toLowerCase();
    if (email && !EMAIL_OK.test(email)) {
      throw badInput(400, "Enter a valid email address.");
    }
    if (email) {
      const taken = await User.exists({
        email,
        organization: user.organization,
        deletedAt: null,
        _id: { $ne: user._id },
      });
      if (taken) throw badInput(409, "This email is already used by another account.");
    }
    user.email = email || null;
  }

  if (has("phone")) {
    const phone = normalizeCrmPhone(body.phone);
    if (!phone || !PHONE_OK.test(phone)) {
      throw badInput(400, "Enter a valid mobile number with country code (e.g. +919876543210).");
    }
    const taken = await User.exists({
      phone,
      organization: user.organization,
      deletedAt: null,
      _id: { $ne: user._id },
    });
    if (taken) throw badInput(409, "This phone number is already used by another account.");
    user.phone = phone;
  }

  if (has("language")) {
    user.language = String(body.language || "").trim().toLowerCase() || "en";
  }
}

async function saveFarmer(user) {
  try {
    await user.save();
  } catch (err) {
    if (err.name === "ValidationError") {
      throw badInput(400, Object.values(err.errors)[0]?.message || "Invalid profile details.");
    }
    throw err;
  }
}

function sendError(res, error, label, fallback) {
  const status = error.status || 500;
  if (status >= 500) console.error(`${label}:`, error);
  return fail(res, status, status >= 500 ? fallback : error.message);
}

/**
 * PATCH /crm/farmers/:id — edit a farmer's profile (name, phone, email,
 * language, location). Only fields present in the body change; "" clears an
 * optional one. Same scope as the farmer view: admins edit farmers in their
 * region, client logins only their own client's farmers. Phone and email are
 * unique per organization.
 */
export const updateBiodropsFarmer = async (req, res) => {
  try {
    const { baseQuery, org } = await resolveCrmUserBaseQuery(req);
    const roleQuery = await buildFarmerRoleQuery(baseQuery, org);
    const user = await User.findOne({ ...roleQuery, _id: req.params.id });
    if (!user) return fail(res, 404, "Farmer not found.");

    await applyFarmerProfile(user, req.body);
    await saveFarmer(user);

    // Respond with the same shape as GET /crm/farmers/:id.
    return getBiodropsFarmerById(req, res);
  } catch (error) {
    return sendError(res, error, "updateBiodropsFarmer", "Failed to update farmer.");
  }
};

/**
 * POST /crm/farmers — a CRM admin registers a farmer in BIODROPS. The account
 * is complete (terms accepted), so the farmer can log in with a WhatsApp or
 * email OTP straight away. Optional clientId tags the farmer to a client org.
 * A region-scoped admin can only add farmers inside their own region.
 */
export const createBiodropsFarmer = async (req, res) => {
  let created = null;
  try {
    const { baseQuery, org } = await resolveCrmUserBaseQuery(req);
    const body = req.body || {};
    if (!String(body.firstName || "").trim()) return fail(res, 400, "First name is required.");
    if (!String(body.phone || "").trim()) return fail(res, 400, "Mobile number is required.");

    let clientOrganization = null;
    if (body.clientId) {
      const client = await findClientById(body.clientId);
      if (!client) return fail(res, 400, "Client not found.");
      clientOrganization = client._id;
    }
    const user = new User({
      role: "farmer",
      terms: true,
      organization: org._id,
      clientOrganization,
      clientSource: "web",
    });
    await applyFarmerProfile(user, body);
    await saveFarmer(user);
    created = user;

    // Region check: the new farmer must fall inside the admin's own scope.
    const roleQuery = await buildFarmerRoleQuery(baseQuery, org);
    if (!(await User.exists({ ...roleQuery, _id: user._id }))) {
      await User.deleteOne({ _id: user._id });
      created = null;
      return fail(res, 403, "This farmer's location is outside your region.");
    }

    req.params.id = String(user._id);
    return getBiodropsFarmerById(req, res);
  } catch (error) {
    if (created) await User.deleteOne({ _id: created._id }).catch(() => {});
    return sendError(res, error, "createBiodropsFarmer", "Failed to add farmer.");
  }
};
