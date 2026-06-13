import User from "../../../models/user.model.js";
import FarmField from "../../../models/field.model.js";
import SubscriptionPlan from "../../../models/subscription-plan.model.js";
import UserSubscription from "../../../models/user-subscription.model.js";
import { resolveCrmUserBaseQuery } from "../utils/crmUserQuery.js";
import { BRAND_ID } from "../constants.js";
import { createSubscriptionActivationNotification } from "../../../services/notification.service.js";
import {
  cancelRazorpaySubscriptionBestEffort,
  getRazorpay,
} from "../../../services/razorpay.subscription.service.js";

const VALID_BILLING_CYCLES = ["monthly", "yearly", "season"];

export async function assertCrmFarmerAccess(req, farmerId) {
  const { baseQuery, org } = await resolveCrmUserBaseQuery(req);

  const user = await User.findOne({
    ...baseQuery,
    _id: farmerId,
    role: "farmer",
    organization: org._id,
  }).lean();

  if (!user) {
    const err = new Error("Farmer not found or outside your scope.");
    err.status = 404;
    throw err;
  }

  return { user, org };
}

function computeEndDate(billingCycle, startDate = new Date()) {
  const endDate = new Date(startDate);
  if (billingCycle === "monthly") {
    endDate.setDate(endDate.getDate() + 30);
  } else if (billingCycle === "yearly") {
    endDate.setDate(endDate.getDate() + 365);
  } else if (billingCycle === "season") {
    endDate.setDate(endDate.getDate() + 120);
  }
  return endDate;
}

export async function activateEnterpriseFarmSubscription({
  farmerId,
  farmId,
  planId,
  billingCycle,
  adminId,
}) {
  if (!VALID_BILLING_CYCLES.includes(billingCycle)) {
    const err = new Error("billingCycle must be monthly, yearly, or season");
    err.status = 400;
    throw err;
  }

  const plan = await SubscriptionPlan.findOne({
    _id: planId,
    active: true,
    brand: BRAND_ID,
  });

  if (!plan) {
    const err = new Error("BioDrops plan not found");
    err.status = 404;
    throw err;
  }

  const farm = await FarmField.findOne({ _id: farmId, user: farmerId });
  if (!farm) {
    const err = new Error("Farm not found for this farmer");
    err.status = 404;
    throw err;
  }

  const area = Number(farm.acre) || 1;
  const startDate = new Date();
  const endDate = computeEndDate(billingCycle, startDate);

  await UserSubscription.updateMany(
    {
      userId: farmerId,
      fieldId: farmId,
      status: { $in: ["active", "pending"] },
    },
    { $set: { status: "expired" } },
  );

  const subscription = await UserSubscription.create({
    userId: farmerId,
    fieldId: farmId,
    planId,
    platform: plan.platform,
    area,
    unit: "acre",
    billingCycle,
    displayCurrency: null,
    pricePerUnitMinor: 0,
    totalAmountMinor: 0,
    chargedCurrency: null,
    exchangeRate: null,
    status: "active",
    startDate,
    endDate,
    billingMode: "legacy_order",
    activationSource: "admin",
    activatedByAdmin: true,
    activatedBy: adminId,
  });

  await createSubscriptionActivationNotification(subscription._id);
  return subscription;
}

export async function assertCrmSubscriptionAccess(req, subscriptionId) {
  const subscription = await UserSubscription.findById(subscriptionId).lean();
  if (!subscription) {
    const err = new Error("Subscription not found");
    err.status = 404;
    throw err;
  }

  await assertCrmFarmerAccess(req, subscription.userId);
  return subscription;
}

export async function cancelEnterpriseFarmSubscription(subscriptionId) {
  const subscription = await UserSubscription.findById(subscriptionId);
  if (!subscription) {
    const err = new Error("Subscription not found");
    err.status = 404;
    throw err;
  }

  if (subscription.status === "cancelled") {
    const err = new Error("Subscription is already cancelled");
    err.status = 400;
    throw err;
  }

  const razorpay = getRazorpay();
  await cancelRazorpaySubscriptionBestEffort(
    razorpay,
    subscription.razorpaySubscriptionId,
  );

  subscription.status = "cancelled";
  await subscription.save();
  return subscription;
}

export async function approveCardRemainderSubscription(subscriptionId, adminId) {
  const subscription = await UserSubscription.findById(subscriptionId);
  if (!subscription) {
    const err = new Error("Subscription not found");
    err.status = 404;
    throw err;
  }

  if (subscription.status !== "pending") {
    const err = new Error("Only pending subscriptions can be approved");
    err.status = 400;
    throw err;
  }

  const pendingAcres = Number(subscription.pendingAdminAcres) || 0;
  if (
    subscription.activationSource !== "hybrid" ||
    pendingAcres <= 0
  ) {
    const err = new Error(
      "This subscription is not waiting for card remainder approval",
    );
    err.status = 400;
    throw err;
  }

  subscription.status = "active";
  subscription.pendingAdminAcres = 0;
  subscription.activatedByAdmin = true;
  subscription.activatedBy = adminId;
  subscription.subscriptionPhase = "active_paid";
  await subscription.save();

  await createSubscriptionActivationNotification(subscription._id);
  return subscription;
}
