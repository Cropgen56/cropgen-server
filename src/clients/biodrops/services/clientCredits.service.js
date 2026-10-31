import mongoose from "mongoose";
import { addMonths } from "date-fns";
import BiodropsClientCreditPlan from "../models/biodrops-client-credit-plan.model.js";
import BiodropsClientCreditPurchase from "../models/biodrops-client-credit-purchase.model.js";
import BiodropsClientCreditTransaction from "../models/biodrops-client-credit-transaction.model.js";
import Organization from "../../../models/organization.model.js";
import User from "../../../models/user.model.js";
import FarmField from "../../../models/field.model.js";
import SubscriptionPlan from "../../../models/subscription-plan.model.js";
import UserSubscription from "../../../models/user-subscription.model.js";
import { createSubscriptionActivationNotification } from "../../../services/notification.service.js";
import {
  createRazorpayProductOrder,
  verifyRazorpayPaymentSignature,
} from "../../../services/razorpay.order.service.js";

/** 1 credit = 1 hectare. Farms store their area in acres. */
const HECTARES_PER_ACRE = 0.404686;
/** Slack for float sums of 2-decimal credit amounts. */
const EPS = 1e-6;
/** Razorpay rejects orders below ₹1. */
const MIN_ORDER_MINOR = 100;

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

export function round2(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

export function acresToCredits(acres) {
  const a = Number(acres) || 0;
  if (a <= 0) return 0;
  return Math.max(0.01, round2(a * HECTARES_PER_ACRE));
}

export function planTotalMinor(plan) {
  return Math.round(
    (Number(plan.totalHectares) || 0) * (Number(plan.pricePerHectareMinor) || 0),
  );
}

/** UserSubscription.billingCycle is an enum; pick the closest label. */
function billingCycleForMonths(months) {
  if (months >= 12) return "yearly";
  if (months <= 1) return "monthly";
  return "season";
}

function activePoolQuery(clientId, now = new Date()) {
  return {
    clientOrganization: clientId,
    paymentStatus: "paid",
    validUntil: { $gt: now },
  };
}

function personName(user) {
  if (!user) return "—";
  const name = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  return name || user.phone || user.email || "—";
}

/* ----------------------------- formatting ----------------------------- */

export function purchaseStatus(purchase, now = new Date()) {
  if (purchase.paymentStatus !== "paid") return purchase.paymentStatus;
  if (purchase.validUntil && new Date(purchase.validUntil) <= now) return "expired";
  const remaining = (purchase.totalCredits || 0) - (purchase.usedCredits || 0);
  return remaining <= EPS ? "exhausted" : "active";
}

export function formatCreditPlan(plan) {
  const featurePlan =
    plan.featurePlanId && typeof plan.featurePlanId === "object" && plan.featurePlanId.name
      ? plan.featurePlanId
      : null;
  const client =
    plan.clientOrganization &&
    typeof plan.clientOrganization === "object" &&
    plan.clientOrganization.organizationName
      ? plan.clientOrganization
      : null;
  return {
    id: String(plan._id),
    name: plan.name,
    description: plan.description || "",
    totalHectares: plan.totalHectares,
    pricePerHectareMinor: plan.pricePerHectareMinor,
    totalPriceMinor: planTotalMinor(plan),
    currency: plan.currency || "INR",
    validityMonths: plan.validityMonths,
    featurePlan: featurePlan
      ? { id: String(featurePlan._id), name: featurePlan.name, features: featurePlan.features || {} }
      : null,
    featurePlanId: plan.featurePlanId?._id
      ? String(plan.featurePlanId._id)
      : plan.featurePlanId
        ? String(plan.featurePlanId)
        : null,
    client: client
      ? {
          id: String(client._id),
          organizationName: client.organizationName,
          organizationCode: client.organizationCode,
        }
      : null,
    active: plan.active !== false,
    createdAt: plan.createdAt || null,
  };
}

export function formatCreditPurchase(purchase) {
  const total = round2(purchase.totalCredits);
  const used = round2(purchase.usedCredits);
  const client =
    purchase.clientOrganization &&
    typeof purchase.clientOrganization === "object" &&
    purchase.clientOrganization.organizationName
      ? purchase.clientOrganization
      : null;
  return {
    id: String(purchase._id),
    planId: String(purchase.planId?._id || purchase.planId),
    planName: purchase.planSnapshot?.name || "—",
    pricePerHectareMinor: purchase.planSnapshot?.pricePerHectareMinor || 0,
    validityMonths: purchase.planSnapshot?.validityMonths || null,
    totalCredits: total,
    usedCredits: used,
    remainingCredits: Math.max(0, round2(total - used)),
    amountMinor: purchase.amountMinor,
    currency: purchase.currency || "INR",
    paymentStatus: purchase.paymentStatus,
    status: purchaseStatus(purchase),
    razorpayPaymentId: purchase.razorpayPaymentId || null,
    paidAt: purchase.paidAt || null,
    validFrom: purchase.validFrom || null,
    validUntil: purchase.validUntil || null,
    createdAt: purchase.createdAt || null,
    client: client
      ? {
          id: String(client._id),
          organizationName: client.organizationName,
          organizationCode: client.organizationCode,
        }
      : null,
  };
}

/* ------------------------------ plans --------------------------------- */

/** Active plans a client may buy: global plans plus ones made for them. */
export async function listPlansForClient(clientId) {
  const plans = await BiodropsClientCreditPlan.find({
    active: true,
    $or: [{ clientOrganization: null }, { clientOrganization: clientId }],
  })
    .populate("featurePlanId", "name features")
    .sort({ totalHectares: 1 })
    .lean();
  return plans.map(formatCreditPlan);
}

/* ----------------------------- purchases ------------------------------ */

/**
 * Razorpay checkout for client plans is off until CLIENT_CREDITS_RAZORPAY=true;
 * until then a purchase is activated as soon as the client clicks buy.
 */
export function isClientCreditRazorpayEnabled() {
  return String(process.env.CLIENT_CREDITS_RAZORPAY || "").toLowerCase() === "true";
}

export async function createClientCreditPurchase({ clientId, planId, userId }) {
  if (!mongoose.Types.ObjectId.isValid(planId)) {
    throw httpError(400, "Invalid plan.");
  }
  const plan = await BiodropsClientCreditPlan.findOne({
    _id: planId,
    active: true,
    $or: [{ clientOrganization: null }, { clientOrganization: clientId }],
  }).lean();
  if (!plan) throw httpError(404, "This plan is no longer available.");

  const amountMinor = planTotalMinor(plan);
  const useRazorpay = isClientCreditRazorpayEnabled();
  if (useRazorpay && amountMinor < MIN_ORDER_MINOR) {
    throw httpError(400, "This plan's price is below the ₹1 payment minimum.");
  }

  const purchase = await BiodropsClientCreditPurchase.create({
    paymentMethod: useRazorpay ? "razorpay" : "direct",
    clientOrganization: clientId,
    planId: plan._id,
    purchasedBy: userId || null,
    planSnapshot: {
      name: plan.name,
      totalHectares: plan.totalHectares,
      pricePerHectareMinor: plan.pricePerHectareMinor,
      validityMonths: plan.validityMonths,
      featurePlanId: plan.featurePlanId,
    },
    amountMinor,
    currency: plan.currency || "INR",
    totalCredits: plan.totalHectares,
  });

  if (!useRazorpay) {
    const { purchase: paid } = await markClientCreditPurchasePaid({ purchase });
    return { purchase: paid, razorpayOrder: null };
  }

  try {
    const razorpayOrder = await createRazorpayProductOrder({
      brand: "biodrops",
      amountMinor,
      currency: purchase.currency,
      receipt: `cc_${purchase._id}`,
      notes: {
        type: "biodrops_client_credits",
        clientCreditPurchaseId: String(purchase._id),
        clientOrganization: String(clientId),
      },
    });
    purchase.razorpayOrderId = razorpayOrder.id;
    await purchase.save();
    return { purchase, razorpayOrder };
  } catch (err) {
    purchase.paymentStatus = "failed";
    await purchase.save().catch(() => {});
    throw err;
  }
}

export function findClientCreditPurchaseByRazorpayOrderId(razorpayOrderId) {
  if (!razorpayOrderId) return null;
  return BiodropsClientCreditPurchase.findOne({ razorpayOrderId });
}

/**
 * Idempotent: the verify call and the payment.captured webhook may both
 * arrive. Only the first one starts the validity window.
 */
export async function markClientCreditPurchasePaid({ purchase, razorpayPaymentId }) {
  const paidAt = new Date();
  const validUntil = addMonths(paidAt, Number(purchase.planSnapshot?.validityMonths) || 12);
  const updated = await BiodropsClientCreditPurchase.findOneAndUpdate(
    { _id: purchase._id, paymentStatus: { $ne: "paid" } },
    {
      $set: {
        paymentStatus: "paid",
        razorpayPaymentId: razorpayPaymentId || purchase.razorpayPaymentId || null,
        paidAt,
        validFrom: paidAt,
        validUntil,
      },
    },
    { new: true },
  );
  if (!updated) {
    return {
      purchase: await BiodropsClientCreditPurchase.findById(purchase._id),
      alreadyPaid: true,
    };
  }
  return { purchase: updated, alreadyPaid: false };
}

export async function verifyClientCreditPurchase({
  clientId,
  purchaseId,
  razorpayOrderId,
  razorpayPaymentId,
  razorpaySignature,
}) {
  if (!mongoose.Types.ObjectId.isValid(purchaseId)) {
    throw httpError(400, "Invalid purchase.");
  }
  const purchase = await BiodropsClientCreditPurchase.findOne({
    _id: purchaseId,
    clientOrganization: clientId,
  });
  if (!purchase) throw httpError(404, "Purchase not found.");
  if (purchase.paymentStatus === "paid") return { purchase, alreadyPaid: true };

  if (!razorpayOrderId || razorpayOrderId !== purchase.razorpayOrderId) {
    throw httpError(400, "Payment does not match this purchase.");
  }
  const valid = verifyRazorpayPaymentSignature({
    razorpayOrderId,
    razorpayPaymentId,
    razorpaySignature,
    brand: "biodrops",
  });
  if (!valid) throw httpError(400, "Payment verification failed.");

  return markClientCreditPurchasePaid({ purchase, razorpayPaymentId });
}

/** Checkout dismissed before paying. A late webhook capture still marks it paid. */
export async function cancelPendingClientCreditPurchase({ clientId, purchaseId }) {
  if (!mongoose.Types.ObjectId.isValid(purchaseId)) {
    throw httpError(400, "Invalid purchase.");
  }
  await BiodropsClientCreditPurchase.updateOne(
    { _id: purchaseId, clientOrganization: clientId, paymentStatus: "pending" },
    { $set: { paymentStatus: "cancelled" } },
  );
}

export async function listClientPurchases(clientId, { paidOnly = false } = {}) {
  const query = { clientOrganization: clientId };
  query.paymentStatus = paidOnly ? "paid" : { $in: ["paid", "pending"] };
  const rows = await BiodropsClientCreditPurchase.find(query)
    .sort({ createdAt: -1 })
    .limit(100)
    .lean();
  return rows.map(formatCreditPurchase);
}

/* ------------------------------ balance ------------------------------- */

export async function getClientCreditSummary(clientId) {
  const now = new Date();
  const pools = await BiodropsClientCreditPurchase.find(activePoolQuery(clientId, now))
    .sort({ validUntil: 1 })
    .lean();

  let totalCredits = 0;
  let usedCredits = 0;
  let nextExpiry = null;
  for (const pool of pools) {
    totalCredits += Number(pool.totalCredits) || 0;
    usedCredits += Number(pool.usedCredits) || 0;
    const left = (pool.totalCredits || 0) - (pool.usedCredits || 0);
    if (!nextExpiry && left > EPS) nextExpiry = pool.validUntil;
  }

  const [lifetime] = await BiodropsClientCreditTransaction.aggregate([
    { $match: { clientOrganization: new mongoose.Types.ObjectId(String(clientId)) } },
    {
      $group: {
        _id: null,
        credits: { $sum: "$credits" },
        farms: { $addToSet: "$fieldId" },
        farmers: { $addToSet: "$userId" },
      },
    },
  ]);

  return {
    totalCredits: round2(totalCredits),
    usedCredits: round2(usedCredits),
    remainingCredits: Math.max(0, round2(totalCredits - usedCredits)),
    activePools: pools.length,
    nextExpiry,
    hasActivePlan: pools.some((p) => (p.totalCredits || 0) - (p.usedCredits || 0) > EPS),
    lifetimeCreditsUsed: round2(lifetime?.credits || 0),
    farmsActivated: lifetime?.farms?.length || 0,
    farmersServed: lifetime?.farmers?.length || 0,
  };
}

/* ------------------------------ debits -------------------------------- */

async function refundDebits(debits) {
  for (const d of debits) {
    await BiodropsClientCreditPurchase.updateOne(
      { _id: d.purchase._id },
      { $inc: { usedCredits: -d.credits } },
    ).catch((err) => console.error("client credit refund failed:", d.purchase._id, err));
  }
}

/**
 * Take `credits` from the client's valid pools, soonest-expiring first.
 * Each take is a conditional $inc so concurrent farm adds can never push a
 * pool past its total. Returns null (and takes nothing) if the pools can't
 * cover the full amount.
 */
async function debitPools(clientId, credits) {
  const pools = await BiodropsClientCreditPurchase.find(activePoolQuery(clientId))
    .sort({ validUntil: 1 })
    .lean();
  const available = pools.reduce(
    (sum, p) => sum + Math.max(0, (p.totalCredits || 0) - (p.usedCredits || 0)),
    0,
  );
  if (available + EPS < credits) return null;

  const debits = [];
  let remaining = credits;
  for (const pool of pools) {
    if (remaining <= EPS) break;
    const avail = round2((pool.totalCredits || 0) - (pool.usedCredits || 0));
    if (avail <= 0) continue;
    const take = round2(Math.min(avail, remaining));
    const updated = await BiodropsClientCreditPurchase.findOneAndUpdate(
      {
        _id: pool._id,
        paymentStatus: "paid",
        $expr: {
          $lte: [{ $add: ["$usedCredits", take] }, { $add: ["$totalCredits", EPS] }],
        },
      },
      { $inc: { usedCredits: take } },
      { new: true },
    ).lean();
    if (!updated) continue; // another request drained this pool first
    debits.push({ purchase: updated, credits: take });
    remaining = round2(remaining - take);
  }

  if (remaining > EPS) {
    await refundDebits(debits);
    return null;
  }
  return debits;
}

async function loadCreditClient(owner) {
  if (!owner?.clientOrganization || owner.role !== "farmer") return null;
  const client = await Organization.findById(owner.clientOrganization)
    .select("status")
    .lean();
  return client && client.status === "active" ? client : null;
}

function ledgerRows(debits, { clientId, reason, field, subscriptionId }) {
  return debits.map((d) => ({
    clientOrganization: clientId,
    purchaseId: d.purchase._id,
    reason,
    credits: d.credits,
    userId: field.user,
    fieldId: field._id,
    fieldName: field.fieldName || "",
    fieldAcres: Number(field.acre) || 0,
    subscriptionId,
  }));
}

/**
 * Shown to a client's farmer right after adding a farm: farms are not
 * unlocked automatically, the client's admin activates them from the CRM.
 */
export async function getClientActivationNotice(owner) {
  const client = await loadCreditClient(owner);
  if (!client) return { required: false };
  const org = await Organization.findById(client._id).select("organizationName").lean();
  return { required: true, clientName: org?.organizationName || "" };
}

function activeSubscriptionQuery(fieldIds, now = new Date()) {
  return {
    fieldId: { $in: fieldIds },
    status: "active",
    $or: [{ endDate: null }, { endDate: { $gt: now } }],
  };
}

/** Debit the field's hectares and create its subscription. */
async function activateFieldFromClientCredits({ field, clientId, activatedBy }) {
  const credits = acresToCredits(field.acre);
  if (credits <= 0) throw httpError(400, "This farm has no area to activate.");

  const debits = await debitPools(clientId, credits);
  if (!debits) {
    const { remainingCredits } = await getClientCreditSummary(clientId);
    throw httpError(
      400,
      `Not enough credits. This farm needs ${credits} credits and you have ${remainingCredits} left. Buy a plan to activate it.`,
    );
  }

  let subscription = null;
  try {
    const endDate = new Date(
      Math.min(...debits.map((d) => new Date(d.purchase.validUntil).getTime())),
    );
    const snapshot = debits[0].purchase.planSnapshot;
    const featurePlan = await SubscriptionPlan.findById(snapshot.featurePlanId)
      .select("platform")
      .lean();

    subscription = await UserSubscription.create({
      userId: field.user,
      fieldId: field._id,
      planId: snapshot.featurePlanId,
      platform: featurePlan?.platform || "all",
      area: Number(field.acre) || 0,
      unit: "acre",
      billingCycle: billingCycleForMonths(Number(snapshot.validityMonths) || 12),
      pricePerUnitMinor: 0,
      totalAmountMinor: 0,
      status: "active",
      startDate: new Date(),
      endDate,
      billingMode: "legacy_order",
      activationSource: "client_credits",
      activatedBy: activatedBy || null,
    });

    // Two simultaneous activations of one farm: the oldest subscription wins,
    // later ones roll back so the farm is only charged once.
    const earlier = await UserSubscription.exists({
      fieldId: field._id,
      status: "active",
      activationSource: "client_credits",
      _id: { $lt: subscription._id },
    });
    if (earlier) throw httpError(409, "This farm is already activated.");

    await BiodropsClientCreditTransaction.insertMany(
      ledgerRows(debits, {
        clientId,
        reason: "farm_activation",
        field,
        subscriptionId: subscription._id,
      }),
    );
  } catch (err) {
    await refundDebits(debits);
    if (subscription) {
      await UserSubscription.deleteOne({ _id: subscription._id }).catch(() => {});
    }
    throw err;
  }

  createSubscriptionActivationNotification(subscription._id).catch((err) =>
    console.error("client credit activation notification:", err),
  );

  return { creditsUsed: credits, subscription };
}

/**
 * Client admin activates one of their farmers' farms from the CRM. Only
 * farms of the client's own farmers, and only farms not already subscribed.
 */
export async function activateClientFarm({ clientId, fieldId, activatedBy }) {
  if (!mongoose.Types.ObjectId.isValid(fieldId)) throw httpError(404, "Farm not found.");
  const field = await FarmField.findById(fieldId).select("user fieldName acre").lean();
  if (!field) throw httpError(404, "Farm not found.");

  const owner = await User.findOne({ _id: field.user, deletedAt: null })
    .select("role clientOrganization")
    .lean();
  if (
    !owner ||
    owner.role !== "farmer" ||
    String(owner.clientOrganization) !== String(clientId)
  ) {
    throw httpError(404, "Farm not found.");
  }
  if (!(await loadCreditClient(owner))) {
    throw httpError(403, "This client organization is inactive.");
  }

  if (await UserSubscription.exists(activeSubscriptionQuery([field._id]))) {
    throw httpError(409, "This farm already has an active subscription.");
  }

  return activateFieldFromClientCredits({ field, clientId, activatedBy });
}

/**
 * Every farm of the client's farmers with its activation state:
 * pending = no active subscription yet; active = subscribed (any source).
 */
export async function listClientFarms(
  clientId,
  { status = "all", search = "", page = 1, limit = 20 } = {},
) {
  const safeLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
  const safePage = Math.max(1, parseInt(page, 10) || 1);

  const farmers = await User.find({
    clientOrganization: clientId,
    role: "farmer",
    deletedAt: null,
  })
    .select("firstName lastName phone")
    .lean();
  const farmerById = new Map(farmers.map((f) => [String(f._id), f]));

  const fields = await FarmField.find({ user: { $in: farmers.map((f) => f._id) } })
    .select("fieldName acre user createdAt")
    .sort({ createdAt: -1 })
    .lean();
  const subs = await UserSubscription.find(activeSubscriptionQuery(fields.map((f) => f._id)))
    .select("fieldId activationSource startDate endDate")
    .lean();
  const subByField = new Map(subs.map((sub) => [String(sub.fieldId), sub]));

  let rows = fields.map((f) => {
    const farmer = farmerById.get(String(f.user));
    const sub = subByField.get(String(f._id));
    const acres = Number(f.acre) || 0;
    return {
      fieldId: String(f._id),
      fieldName: f.fieldName || "—",
      acres: round2(acres),
      hectares: round2(acres * HECTARES_PER_ACRE),
      creditsNeeded: acresToCredits(acres),
      addedAt: f.createdAt || null,
      farmer: {
        id: String(f.user),
        name: personName(farmer),
        phone: farmer?.phone || null,
      },
      status: sub ? "active" : "pending",
      subscription: sub
        ? {
            activationSource: sub.activationSource || "razorpay",
            startDate: sub.startDate || null,
            endDate: sub.endDate || null,
          }
        : null,
    };
  });

  const counts = {
    all: rows.length,
    pending: rows.filter((r) => r.status === "pending").length,
    active: rows.filter((r) => r.status === "active").length,
  };

  if (status === "pending" || status === "active") {
    rows = rows.filter((r) => r.status === status);
  }
  const q = String(search || "").trim().toLowerCase();
  if (q) {
    rows = rows.filter((r) =>
      [r.fieldName, r.farmer.name, r.farmer.phone].some((v) =>
        String(v || "").toLowerCase().includes(q),
      ),
    );
  }

  const total = rows.length;
  return {
    farms: rows.slice((safePage - 1) * safeLimit, safePage * safeLimit),
    counts,
    pagination: {
      page: safePage,
      limit: safeLimit,
      total,
      totalPages: Math.max(1, Math.ceil(total / safeLimit)),
    },
  };
}

/**
 * Farm boundary edited to a larger area: charge the extra hectares so the
 * field stays unlocked (GET /field locks it when area < field acres).
 */
export async function applyClientCreditsToAreaIncrease({ field }) {
  const newAcres = Number(field.acre) || 0;
  const subscription = await UserSubscription.findOne({
    fieldId: field._id,
    status: "active",
    activationSource: "client_credits",
  });
  if (!subscription) return { applied: false, reason: "no_client_subscription" };

  const coveredAcres = Number(subscription.area) || 0;
  if (newAcres <= coveredAcres) return { applied: false, reason: "covered" };

  const owner = await User.findById(field.user).select("role clientOrganization").lean();
  const client = await loadCreditClient(owner);
  if (!client) return { applied: false, reason: "not_client_farmer" };

  const extra = round2(acresToCredits(newAcres) - acresToCredits(coveredAcres));
  const debits = extra > 0 ? await debitPools(client._id, extra) : [];
  if (!debits) {
    return { applied: false, reason: "insufficient_credits", creditsNeeded: extra };
  }

  try {
    subscription.area = newAcres;
    await subscription.save();
    if (debits.length) {
      await BiodropsClientCreditTransaction.insertMany(
        ledgerRows(debits, {
          clientId: client._id,
          reason: "area_increase",
          field,
          subscriptionId: subscription._id,
        }),
      );
    }
  } catch (err) {
    await refundDebits(debits);
    throw err;
  }
  return { applied: true, creditsUsed: extra };
}

/* ------------------------------- usage -------------------------------- */

export async function listClientUsage(clientId, { page = 1, limit = 20, farmerId } = {}) {
  const safeLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
  const safePage = Math.max(1, parseInt(page, 10) || 1);
  const query = { clientOrganization: clientId };
  if (farmerId && mongoose.Types.ObjectId.isValid(farmerId)) query.userId = farmerId;

  const [rows, total] = await Promise.all([
    BiodropsClientCreditTransaction.find(query)
      .populate("userId", "firstName lastName phone")
      .populate("purchaseId", "planSnapshot.name")
      .sort({ createdAt: -1 })
      .skip((safePage - 1) * safeLimit)
      .limit(safeLimit)
      .lean(),
    BiodropsClientCreditTransaction.countDocuments(query),
  ]);

  return {
    transactions: rows.map((t) => ({
      id: String(t._id),
      reason: t.reason,
      credits: round2(t.credits),
      farmer: t.userId
        ? { id: String(t.userId._id), name: personName(t.userId), phone: t.userId.phone || null }
        : null,
      fieldId: String(t.fieldId),
      fieldName: t.fieldName || "—",
      fieldAcres: t.fieldAcres || 0,
      fieldHectares: round2((t.fieldAcres || 0) * HECTARES_PER_ACRE),
      planName: t.purchaseId?.planSnapshot?.name || "—",
      createdAt: t.createdAt,
    })),
    pagination: {
      page: safePage,
      limit: safeLimit,
      total,
      totalPages: Math.max(1, Math.ceil(total / safeLimit)),
    },
  };
}

/** Credits used per farmer, highest first. */
export async function listClientUsageByFarmer(clientId) {
  const rows = await BiodropsClientCreditTransaction.aggregate([
    { $match: { clientOrganization: new mongoose.Types.ObjectId(String(clientId)) } },
    {
      $group: {
        _id: "$userId",
        credits: { $sum: "$credits" },
        farms: { $addToSet: "$fieldId" },
        lastUsedAt: { $max: "$createdAt" },
      },
    },
    { $sort: { credits: -1 } },
    { $limit: 200 },
  ]);
  const users = await User.find({ _id: { $in: rows.map((r) => r._id) } })
    .select("firstName lastName phone")
    .lean();
  const byId = new Map(users.map((u) => [String(u._id), u]));
  return rows.map((r) => {
    const user = byId.get(String(r._id));
    return {
      farmerId: String(r._id),
      name: personName(user),
      phone: user?.phone || null,
      credits: round2(r.credits),
      farms: r.farms.length,
      lastUsedAt: r.lastUsedAt,
    };
  });
}

/** Admin overview: credit position of every client that has bought credits. */
export async function listClientCreditBalances(clientIds) {
  const now = new Date();
  const rows = await BiodropsClientCreditPurchase.aggregate([
    { $match: { clientOrganization: { $in: clientIds }, paymentStatus: "paid" } },
    {
      $group: {
        _id: "$clientOrganization",
        purchases: { $sum: 1 },
        spentMinor: { $sum: "$amountMinor" },
        lifetimeCredits: { $sum: "$totalCredits" },
        activeTotal: {
          $sum: { $cond: [{ $gt: ["$validUntil", now] }, "$totalCredits", 0] },
        },
        activeUsed: {
          $sum: { $cond: [{ $gt: ["$validUntil", now] }, "$usedCredits", 0] },
        },
      },
    },
  ]);
  return new Map(
    rows.map((r) => [
      String(r._id),
      {
        purchases: r.purchases,
        spentMinor: r.spentMinor,
        lifetimeCredits: round2(r.lifetimeCredits),
        totalCredits: round2(r.activeTotal),
        usedCredits: round2(r.activeUsed),
        remainingCredits: Math.max(0, round2(r.activeTotal - r.activeUsed)),
      },
    ]),
  );
}
