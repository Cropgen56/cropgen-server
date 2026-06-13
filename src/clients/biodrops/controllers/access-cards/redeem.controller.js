import mongoose from "mongoose";
import FarmField from "../../../../models/field.model.js";
import SubscriptionPlan from "../../../../models/subscription-plan.model.js";
import UserSubscription from "../../../../models/user-subscription.model.js";
import {
  allocateAcresFromCardEntitlement,
  getPoolSummary,
} from "../../services/acreEntitlement.service.js";
import {
  ensureCardEntitlementForFarmer,
  resolveHybridCardCheckout,
} from "../../services/cardCheckout.service.js";
import { logCardEvent } from "../../services/cardEvent.service.js";

async function resolveBiodropsMobilePlan() {
  return SubscriptionPlan.findOne({
    brand: "biodrops",
    platform: "mobile",
    active: true,
    isInternal: false,
  })
    .sort({ createdAt: 1 })
    .lean();
}

async function activateFieldFromCard({
  userId,
  field,
  plan,
  cardAcres,
  paidAcres,
  validUntil,
  sourceCardId,
  entitlementId,
  activationSource,
}) {
  const area = Number(field.acre) || 1;

  await UserSubscription.updateMany(
    { userId, fieldId: field._id, status: "active" },
    { $set: { status: "expired" } },
  );

  const startDate = new Date();

  await UserSubscription.create({
    userId,
    fieldId: field._id,
    planId: plan._id,
    platform: plan.platform,
    area,
    unit: "acre",
    billingCycle: "yearly",
    displayCurrency: "INR",
    pricePerUnitMinor: 0,
    totalAmountMinor: 0,
    chargedCurrency: null,
    status: "active",
    startDate,
    endDate: validUntil,
    activationSource,
    cardAcres,
    paidAcres,
    entitlementId,
    sourceCardId,
    billingMode: "legacy_order",
  });
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

    const { field, card, existingEntitlement, split } =
      await resolveHybridCardCheckout({ userId, code, fieldId });

    const plan = await resolveBiodropsMobilePlan();
    if (!plan) {
      return res.status(503).json({
        success: false,
        message: "No active BioDrops subscription plan configured",
      });
    }

    if (split.remainderAcres > 0) {
      return res.status(200).json({
        success: true,
        fieldUnlocked: false,
        needsRazorpayPayment: true,
        cardAcresAvailable: split.cardAcres,
        remainderAcresToPay: split.remainderAcres,
        fieldAcres: split.fieldAcres,
        message: `Your card covers ${split.cardAcres.toFixed(2)} of ${split.fieldAcres.toFixed(2)} acres. Pay for the remaining ${split.remainderAcres.toFixed(2)} acres to unlock this field.`,
      });
    }

    let entitlement = existingEntitlement;
    let validUntil;

    if (card.status === "unused") {
      const ensured = await ensureCardEntitlementForFarmer({
        userId,
        card,
        fieldId: field._id,
      });
      entitlement = ensured.entitlement;
      validUntil = ensured.validUntil;
    } else {
      validUntil = entitlement.validUntil;
    }

    const alloc = await allocateAcresFromCardEntitlement(
      userId,
      card._id,
      split.fieldAcres,
    );

    await activateFieldFromCard({
      userId,
      field,
      plan,
      cardAcres: alloc.allocatedAcres,
      paidAcres: 0,
      validUntil,
      sourceCardId: card._id,
      entitlementId: entitlement._id,
      activationSource: "product_card",
    });

    await logCardEvent({
      cardId: card._id,
      batchId: card.batchId,
      eventType: "subscription_activated",
      actorType: "farmer",
      actorId: userId,
      metadata: { fieldId: field._id, cardAcresApplied: alloc.allocatedAcres },
    });

    return res.status(200).json({
      success: true,
      fieldUnlocked: true,
      cardAcresApplied: alloc.allocatedAcres,
      fieldAcres: split.fieldAcres,
      remainingAcresToPay: 0,
      entitlementValidUntil: validUntil,
      message: "Field unlocked with your product card",
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
