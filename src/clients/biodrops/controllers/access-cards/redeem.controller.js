import mongoose from "mongoose";
import SubscriptionPlan from "../../../../models/subscription-plan.model.js";
import UserSubscription from "../../../../models/user-subscription.model.js";
import BiodropsAcreEntitlement from "../../models/biodrops-acre-entitlement.model.js";
import { getPoolSummary } from "../../services/acreEntitlement.service.js";
import { resolveCardForPackageRedemption } from "../../services/cardCheckout.service.js";
import { logCardEvent } from "../../services/cardEvent.service.js";

/** A card entitles the farmer to the BioDrops plan whose acre package matches the card exactly. */
async function resolveMatchingPackagePlan(acreLimit) {
  return SubscriptionPlan.findOne({
    brand: "biodrops",
    active: true,
    isInternal: false,
    maxAcres: acreLimit,
  })
    .sort({ createdAt: 1 })
    .lean();
}

/**
 * Cards generated after the CRM's plan-picker dropdown carry an explicit
 * planId — the reliable path. Cards generated before that (or a plan that
 * was deleted since) fall back to matching by acre cap, same as before.
 */
async function resolveCardPlan(card) {
  if (card.planId) {
    const plan = await SubscriptionPlan.findById(card.planId).lean();
    if (plan) return plan;
  }
  return resolveMatchingPackagePlan(card.acreLimit);
}

export async function redeemAccessCard(req, res) {
  try {
    const userId =
      req.auth?.id || req.auth?._id || req.user?.id || req.user?._id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const { code, fieldId } = req.body || {};

    if (!code || !fieldId) {
      return res.status(400).json({
        success: false,
        message: "code and fieldId are required",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(fieldId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid fieldId",
      });
    }

    const { field, card } = await resolveCardForPackageRedemption({
      userId,
      code,
      fieldId,
    });

    const plan = await resolveCardPlan(card);
    if (!plan) {
      return res.status(503).json({
        success: false,
        message: `No active BioDrops plan is configured for a ${card.acreLimit}-acre package. Ask an admin to create one.`,
      });
    }

    const validUntil = new Date();
    validUntil.setMonth(validUntil.getMonth() + card.durationMonths);

    // The card's whole allotment is consumed activating its one matching
    // package — record it as fully used immediately (no partial/remaining
    // balance, unlike the old per-acre pool model).
    const entitlement = await BiodropsAcreEntitlement.create({
      userId,
      sourceCardId: card._id,
      totalAcres: card.acreLimit,
      usedAcres: card.acreLimit,
      validUntil,
      status: "exhausted",
    });

    card.status = "redeemed";
    card.redeemedBy = userId;
    card.redeemedAt = new Date();
    await card.save();

    await UserSubscription.updateMany(
      { userId, fieldId: field._id, status: "active" },
      { $set: { status: "expired" } },
    );

    const startDate = new Date();
    const fieldAcres = Number(field.acre) || 1;

    const subscription = await UserSubscription.create({
      userId,
      fieldId: field._id,
      planId: plan._id,
      platform: plan.platform,
      area: fieldAcres,
      unit: "acre",
      billingCycle: "yearly",
      displayCurrency: "INR",
      pricePerUnitMinor: 0,
      totalAmountMinor: 0,
      chargedCurrency: null,
      status: "active",
      startDate,
      endDate: validUntil,
      activationSource: "product_card",
      cardAcres: card.acreLimit,
      paidAcres: 0,
      entitlementId: entitlement._id,
      sourceCardId: card._id,
      billingMode: "legacy_order",
    });

    await logCardEvent({
      cardId: card._id,
      batchId: card.batchId,
      eventType: "subscription_activated",
      actorType: "farmer",
      actorId: userId,
      metadata: {
        fieldId: field._id,
        planId: plan._id,
        packageAcres: card.acreLimit,
      },
    });

    const overCap = fieldAcres > card.acreLimit + 0.05;

    return res.status(200).json({
      success: true,
      fieldUnlocked: true,
      planId: plan._id,
      planName: plan.name,
      packageAcres: card.acreLimit,
      fieldAcres,
      entitlementValidUntil: validUntil,
      subscriptionId: subscription._id,
      message: overCap
        ? `Field unlocked with the ${plan.name} package. Note: this field is ${fieldAcres.toFixed(2)} acres, larger than the card's ${card.acreLimit}-acre cap.`
        : `Field unlocked with the ${plan.name} package.`,
    });
  } catch (error) {
    const statusCode = error.status || 500;
    if (statusCode >= 500) console.error("redeemAccessCard:", error);
    return res.status(statusCode).json({
      success: false,
      message: error.message || "Failed to redeem card",
    });
  }
}

export async function getAccessCardEntitlement(req, res) {
  try {
    const userId =
      req.auth?.id || req.auth?._id || req.user?.id || req.user?._id;
    const pool = await getPoolSummary(userId);

    return res.status(200).json({
      success: true,
      data: pool,
    });
  } catch (error) {
    console.error("getAccessCardEntitlement:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch entitlement",
    });
  }
}
