import mongoose from "mongoose";
import Organization from "../../../../models/organization.model.js";
import User from "../../../../models/user.model.js";
import { ORGANIZATION_CODE } from "../../constants.js";
import { resolveOrganizationByCode } from "../../../../utils/auth/authUtils.js";
import { normalizeLoginEmail } from "../../../../utils/auth/orgScope.js";
import { assertCrmFarmerAccess } from "../../services/crmSubscription.service.js";
import { sendCrmLoginInstructionsEmail } from "../../services/crmInvitationEmail.service.js";
import {
  findActiveClientByCode,
  findClientById,
  formatClientOrg,
  generateUniqueClientCode,
  isValidClientCodeFormat,
  normalizeClientCode,
} from "../../utils/clientOrg.js";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function fail(res, status, message) {
  return res.status(status).json({ success: false, message });
}

function sendError(res, error, label, fallback) {
  const status = error.status || 500;
  if (status >= 500) console.error(`${label}:`, error);
  return fail(res, status, status >= 500 ? fallback : error.message);
}

function pickAddress(address) {
  if (!address || typeof address !== "object") return undefined;
  const out = {};
  for (const key of ["city", "state", "country", "pincode"]) {
    if (address[key] != null) out[key] = String(address[key]).trim();
  }
  return out;
}

async function emailInUse(email, exceptUserId = null) {
  const query = {
    email: new RegExp(`^${email.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i"),
    deletedAt: null,
  };
  if (exceptUserId) query._id = { $ne: exceptUserId };
  return !!(await User.exists(query));
}

/** Client viewer logins (staff + clientOrganization, no assignment) per client. */
async function loadClientLogins(clientIds) {
  const users = await User.find({
    clientOrganization: { $in: clientIds },
    role: "staff",
    deletedAt: null,
  })
    .select("email firstName lastName clientOrganization lastLoginAt")
    .lean();
  const byClient = new Map();
  for (const u of users) {
    const key = String(u.clientOrganization);
    if (!byClient.has(key)) byClient.set(key, []);
    byClient.get(key).push({
      id: String(u._id),
      email: u.email || null,
      name: [u.firstName, u.lastName].filter(Boolean).join(" ").trim() || null,
      lastLoginAt: u.lastLoginAt || null,
    });
  }
  return byClient;
}

async function loadFarmerCounts(clientIds) {
  const rows = await User.aggregate([
    {
      $match: {
        clientOrganization: { $in: clientIds },
        role: "farmer",
        deletedAt: null,
      },
    },
    { $group: { _id: "$clientOrganization", count: { $sum: 1 } } },
  ]);
  return new Map(rows.map((r) => [String(r._id), r.count]));
}

async function formatClients(orgs) {
  const ids = orgs.map((o) => o._id);
  const [counts, logins] = await Promise.all([
    loadFarmerCounts(ids),
    loadClientLogins(ids),
  ]);
  return orgs.map((o) =>
    formatClientOrg(o, {
      farmerCount: counts.get(String(o._id)) || 0,
      logins: logins.get(String(o._id)) || [],
    }),
  );
}

/** GET /crm/clients */
export async function listCrmClients(req, res) {
  try {
    const { org: biodrops } = await resolveOrganizationByCode(ORGANIZATION_CODE);
    const orgs = await Organization.find({ parentOrganization: biodrops._id })
      .sort({ createdAt: -1 })
      .lean();
    return res.json({ success: true, clients: await formatClients(orgs) });
  } catch (error) {
    return sendError(res, error, "listCrmClients", "Failed to load clients.");
  }
}

/** GET /crm/clients/:id */
export async function getCrmClientById(req, res) {
  try {
    const org = await findClientById(req.params.id);
    if (!org) return fail(res, 404, "Client not found.");
    const [client] = await formatClients([org.toObject()]);
    return res.json({ success: true, client });
  } catch (error) {
    return sendError(res, error, "getCrmClientById", "Failed to load client.");
  }
}

/**
 * POST /crm/clients
 * Creates the client org (child of BIODROPS) and its read-only CRM login.
 */
export async function createCrmClient(req, res) {
  let createdOrg = null;
  try {
    const organizationName = String(req.body.organizationName || "").trim();
    const email = normalizeLoginEmail(req.body.email);
    const phoneNumber = String(req.body.phoneNumber || "").trim();
    const contactName = String(req.body.contactName || "").trim();
    const requestedCode = normalizeClientCode(req.body.organizationCode);
    const sendWelcomeEmail = req.body.sendWelcomeEmail !== false;

    if (!organizationName) return fail(res, 400, "Organization name is required.");
    if (organizationName.length > 120) return fail(res, 400, "Organization name is too long.");
    if (!EMAIL_PATTERN.test(email)) return fail(res, 400, "A valid login email is required.");
    if (requestedCode && !isValidClientCodeFormat(requestedCode)) {
      return fail(
        res,
        400,
        "Code must be 3–24 characters: letters, numbers and hyphens only.",
      );
    }
    if (await emailInUse(email)) {
      return fail(res, 409, "This email already belongs to an account. Use a different login email.");
    }

    const organizationCode = requestedCode || (await generateUniqueClientCode());
    if (await Organization.exists({ organizationCode })) {
      return fail(res, 409, `Code '${organizationCode}' is already in use.`);
    }

    const { org: biodrops } = await resolveOrganizationByCode(ORGANIZATION_CODE);

    createdOrg = await Organization.create({
      organizationName,
      organizationCode,
      email,
      phoneNumber: phoneNumber || undefined,
      address: pickAddress(req.body.address),
      parentOrganization: biodrops._id,
      status: "active",
    });

    const [firstName, ...rest] = (contactName || organizationName).split(/\s+/);
    const loginUser = await User.create({
      email,
      firstName: firstName.slice(0, 50),
      lastName: rest.join(" ").slice(0, 50),
      phone: phoneNumber || undefined,
      role: "staff",
      organization: biodrops._id,
      clientOrganization: createdOrg._id,
      terms: true,
      clientSource: "web",
    });

    let welcomeEmailSent = false;
    if (sendWelcomeEmail) {
      try {
        await sendCrmLoginInstructionsEmail({ to: email, userId: loginUser._id });
        welcomeEmailSent = true;
      } catch (emailError) {
        console.error("createCrmClient welcome email:", emailError);
      }
    }

    const [client] = await formatClients([createdOrg.toObject()]);
    return res.status(201).json({ success: true, client, welcomeEmailSent });
  } catch (error) {
    // No transaction: undo the org if the login user could not be created.
    if (createdOrg) {
      await Organization.deleteOne({ _id: createdOrg._id }).catch(() => {});
    }
    if (error?.code === 11000) {
      return fail(res, 409, "That code or email is already in use.");
    }
    return sendError(res, error, "createCrmClient", "Failed to create client.");
  }
}

/**
 * PATCH /crm/clients/:id
 * Name, contact details and status. The code is immutable: farmers have
 * already registered with it.
 */
export async function updateCrmClient(req, res) {
  try {
    const org = await findClientById(req.params.id);
    if (!org) return fail(res, 404, "Client not found.");

    const { organizationName, phoneNumber, address, status } = req.body;

    if (organizationName !== undefined) {
      const name = String(organizationName).trim();
      if (!name) return fail(res, 400, "Organization name is required.");
      org.organizationName = name.slice(0, 120);
    }
    if (phoneNumber !== undefined) org.phoneNumber = String(phoneNumber).trim();
    if (address !== undefined) org.address = pickAddress(address);
    if (status !== undefined) {
      if (!["active", "inactive"].includes(status)) {
        return fail(res, 400, "Status must be 'active' or 'inactive'.");
      }
      org.status = status;
    }

    await org.save();
    const [client] = await formatClients([org.toObject()]);
    return res.json({ success: true, client });
  } catch (error) {
    return sendError(res, error, "updateCrmClient", "Failed to update client.");
  }
}

/**
 * PATCH /crm/farmers/:id/client  { clientId: string | null }
 * Attach an existing BioDrops farmer to a client, or detach them.
 */
export async function assignFarmerToClient(req, res) {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) return fail(res, 400, "Invalid farmer ID.");

    const { user } = await assertCrmFarmerAccess(req, id);
    if (user.role !== "farmer") {
      return fail(res, 400, "Only farmer accounts can be assigned to a client.");
    }

    const { clientId } = req.body;
    let client = null;
    if (clientId) {
      client = await findClientById(clientId);
      if (!client) return fail(res, 404, "Client not found.");
      if (client.status !== "active") return fail(res, 400, "Client is inactive.");
    }

    await User.updateOne(
      { _id: user._id },
      { $set: { clientOrganization: client ? client._id : null } },
    );

    return res.json({
      success: true,
      farmerId: String(user._id),
      client: client ? formatClientOrg(client.toObject()) : null,
    });
  } catch (error) {
    return sendError(res, error, "assignFarmerToClient", "Failed to update farmer.");
  }
}

/** GET /biodrops/client-code/:code — public signup check. */
export async function checkClientCode(req, res) {
  try {
    const client = await findActiveClientByCode(req.params.code);
    if (!client) return res.json({ success: true, valid: false });
    return res.json({
      success: true,
      valid: true,
      organizationName: client.organizationName,
      organizationCode: client.organizationCode,
    });
  } catch (error) {
    return sendError(res, error, "checkClientCode", "Failed to check code.");
  }
}
