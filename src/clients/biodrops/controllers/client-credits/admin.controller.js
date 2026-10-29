import mongoose from "mongoose";
import BiodropsClientCreditPlan from "../../models/biodrops-client-credit-plan.model.js";
import BiodropsClientCreditPurchase from "../../models/biodrops-client-credit-purchase.model.js";
import Organization from "../../../../models/organization.model.js";
import SubscriptionPlan from "../../../../models/subscription-plan.model.js";
import { ORGANIZATION_CODE, BRAND_ID } from "../../constants.js";
import { resolveOrganizationByCode } from "../../../../utils/auth/authUtils.js";
import { findClientById, formatClientOrg } from "../../utils/clientOrg.js";
import {
  formatCreditPlan,
  formatCreditPurchase,
  getClientCreditSummary,
  listClientCreditBalances,
  listClientPurchases,
  listClientUsage,
  listClientUsageByFarmer,
} from "../../services/clientCredits.service.js";

function fail(res, status, message) {
  return res.status(status).json({ success: false, message });
}

function sendError(res, error, label, fallback) {
  const status = error.status || 500;
  if (status >= 500) console.error(`${label}:`, error);
  return fail(res, status, status >= 500 ? fallback : error.message);
}

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  return err;
}

const PLAN_POPULATE = [
  { path: "featurePlanId", select: "name features" },
  { path: "clientOrganization", select: "organizationName organizationCode" },
];

/** Validated plan fields from the request; `partial` for PATCH. */
async function readPlanInput(body = {}, { partial = false } = {}) {
  const out = {};
  const has = (key) => body[key] !== undefined;

  if (!partial || has("name")) {
    const name = String(body.name || "").trim();
    if (!name) throw badRequest("Plan name is required.");
    out.name = name.slice(0, 120);
  }
  if (has("description")) out.description = String(body.description || "").trim().slice(0, 1000);

  if (!partial || has("totalHectares")) {
    const hectares = Number(body.totalHectares);
    if (!Number.isFinite(hectares) || hectares < 1) {
      throw badRequest("Total hectares must be at least 1.");
    }
    out.totalHectares = Math.round(hectares * 100) / 100;
  }
  if (!partial || has("pricePerHectareMinor")) {
    const price = Number(body.pricePerHectareMinor);
    if (!Number.isFinite(price) || price < 0) {
      throw badRequest("Price per hectare must be zero or more.");
    }
    out.pricePerHectareMinor = Math.round(price);
  }
  if (!partial || has("validityMonths")) {
    const months = parseInt(body.validityMonths, 10);
    if (!Number.isInteger(months) || months < 1 || months > 60) {
      throw badRequest("Validity must be between 1 and 60 months.");
    }
    out.validityMonths = months;
  }
  if (!partial || has("featurePlanId")) {
    const id = body.featurePlanId;
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      throw badRequest("Choose the feature plan unlocked farms will get.");
    }
    const exists = await SubscriptionPlan.exists({ _id: id, brand: BRAND_ID });
    if (!exists) throw badRequest("Feature plan not found.");
    out.featurePlanId = id;
  }
  if (has("clientId")) {
    if (!body.clientId) {
      out.clientOrganization = null;
    } else {
      const client = await findClientById(body.clientId);
      if (!client) throw badRequest("Client not found.");
      out.clientOrganization = client._id;
    }
  }
  if (has("active")) out.active = Boolean(body.active);
  return out;
}

/** GET /crm/client-credit-plans */
export async function listClientCreditPlans(req, res) {
  try {
    const plans = await BiodropsClientCreditPlan.find({})
      .populate(PLAN_POPULATE)
      .sort({ createdAt: -1 })
      .lean();
    const counts = await BiodropsClientCreditPurchase.aggregate([
      { $match: { paymentStatus: "paid" } },
      { $group: { _id: "$planId", count: { $sum: 1 } } },
    ]);
    const byPlan = new Map(counts.map((c) => [String(c._id), c.count]));
    return res.json({
      success: true,
      plans: plans.map((p) => ({
        ...formatCreditPlan(p),
        purchaseCount: byPlan.get(String(p._id)) || 0,
      })),
    });
  } catch (error) {
    return sendError(res, error, "listClientCreditPlans", "Failed to load plans.");
  }
}

/** GET /crm/client-credit-plans/:id */
export async function getClientCreditPlan(req, res) {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) return fail(res, 404, "Plan not found.");
    const plan = await BiodropsClientCreditPlan.findById(req.params.id)
      .populate(PLAN_POPULATE)
      .lean();
    if (!plan) return fail(res, 404, "Plan not found.");
    return res.json({ success: true, plan: formatCreditPlan(plan) });
  } catch (error) {
    return sendError(res, error, "getClientCreditPlan", "Failed to load plan.");
  }
}

/** POST /crm/client-credit-plans */
export async function createClientCreditPlan(req, res) {
  try {
    const input = await readPlanInput(req.body);
    const created = await BiodropsClientCreditPlan.create({
      ...input,
      createdBy: req.biodropsAdminActor?.id || null,
    });
    const plan = await BiodropsClientCreditPlan.findById(created._id)
      .populate(PLAN_POPULATE)
      .lean();
    return res.status(201).json({ success: true, plan: formatCreditPlan(plan) });
  } catch (error) {
    return sendError(res, error, "createClientCreditPlan", "Failed to create plan.");
  }
}

/**
 * PATCH /crm/client-credit-plans/:id
 * Purchases keep a snapshot of the terms, so edits only affect new purchases.
 */
export async function updateClientCreditPlan(req, res) {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) return fail(res, 404, "Plan not found.");
    const input = await readPlanInput(req.body, { partial: true });
    const plan = await BiodropsClientCreditPlan.findByIdAndUpdate(
      req.params.id,
      { $set: input },
      { new: true, runValidators: true },
    )
      .populate(PLAN_POPULATE)
      .lean();
    if (!plan) return fail(res, 404, "Plan not found.");
    return res.json({ success: true, plan: formatCreditPlan(plan) });
  } catch (error) {
    return sendError(res, error, "updateClientCreditPlan", "Failed to update plan.");
  }
}

/**
 * DELETE /crm/client-credit-plans/:id
 * Safe after purchases: each purchase keeps a snapshot of the plan terms, so
 * clients keep their credits and history. Use PATCH { active } to hide a
 * plan without deleting it.
 */
export async function deleteClientCreditPlan(req, res) {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) return fail(res, 404, "Plan not found.");
    const plan = await BiodropsClientCreditPlan.findByIdAndDelete(req.params.id);
    if (!plan) return fail(res, 404, "Plan not found.");
    return res.json({ success: true, deleted: true });
  } catch (error) {
    return sendError(res, error, "deleteClientCreditPlan", "Failed to delete plan.");
  }
}

/** GET /crm/client-credits/overview — every client's credit position. */
export async function getClientCreditsOverview(req, res) {
  try {
    const { org: biodrops } = await resolveOrganizationByCode(ORGANIZATION_CODE);
    const clients = await Organization.find({ parentOrganization: biodrops._id })
      .sort({ organizationName: 1 })
      .lean();
    const balances = await listClientCreditBalances(clients.map((c) => c._id));
    const empty = {
      purchases: 0,
      spentMinor: 0,
      lifetimeCredits: 0,
      totalCredits: 0,
      usedCredits: 0,
      remainingCredits: 0,
    };

    const recent = await BiodropsClientCreditPurchase.find({ paymentStatus: "paid" })
      .populate("clientOrganization", "organizationName organizationCode")
      .sort({ paidAt: -1 })
      .limit(20)
      .lean();

    return res.json({
      success: true,
      clients: clients.map((c) =>
        formatClientOrg(c, { credits: balances.get(String(c._id)) || empty }),
      ),
      recentPurchases: recent.map(formatCreditPurchase),
    });
  } catch (error) {
    return sendError(res, error, "getClientCreditsOverview", "Failed to load client credits.");
  }
}

/** GET /crm/client-credits/clients/:clientId — one client's credits, purchases and usage. */
export async function getClientCreditsDetail(req, res) {
  try {
    const client = await findClientById(req.params.clientId);
    if (!client) return fail(res, 404, "Client not found.");
    const [summary, purchases, byFarmer, usage] = await Promise.all([
      getClientCreditSummary(client._id),
      listClientPurchases(client._id, { paidOnly: true }),
      listClientUsageByFarmer(client._id),
      listClientUsage(client._id, req.query),
    ]);
    return res.json({
      success: true,
      client: formatClientOrg(client.toObject()),
      summary,
      purchases,
      byFarmer,
      ...usage,
    });
  } catch (error) {
    return sendError(res, error, "getClientCreditsDetail", "Failed to load client credits.");
  }
}
