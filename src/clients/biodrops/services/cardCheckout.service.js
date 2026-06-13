import FarmField from "../../../models/field.model.js";
import UserSubscription from "../../../models/user-subscription.model.js";
import BiodropsProductCard from "../models/biodrops-product-card.model.js";
import BiodropsAcreEntitlement from "../models/biodrops-acre-entitlement.model.js";
import { hashCardCode, normalizeCardCode } from "../utils/cardCode.js";
import { logCardEvent } from "./cardEvent.service.js";
import { allocateAcresFromCardEntitlement } from "./acreEntitlement.service.js";

export async function resolveCardByCode(code) {
  const normalized = normalizeCardCode(code);
  const card = await BiodropsProductCard.findOne({
    codeHash: hashCardCode(normalized),
  });
  return { card, normalized };
}

export function getAvailableAcresOnEntitlement(entitlement) {
  if (!entitlement) return 0;
  if (new Date(entitlement.validUntil) < new Date()) return 0;
  return Math.max(
    0,
    Number(entitlement.totalAcres) - (Number(entitlement.usedAcres) || 0),
  );
}

export function getAvailableAcresForCard(card, entitlement) {
  if (entitlement) return getAvailableAcresOnEntitlement(entitlement);
  if (card?.status === "unused") return Number(card.acreLimit) || 0;
  return 0;
}

export function computeHybridAcreSplit(fieldAcres, cardAvailableAcres) {
  const acres = Number(fieldAcres) || 1;
  const available = Number(cardAvailableAcres) || 0;
  const cardAcres = Math.min(available, acres);
  const remainderAcres = Math.max(0, acres - cardAcres);
  return { cardAcres, remainderAcres, fieldAcres: acres };
}

export async function assertCardUsableByFarmer(userId, card) {
  if (["revoked", "expired"].includes(card.status)) {
    const err = new Error(`Card is ${card.status}`);
    err.status = 400;
    throw err;
  }

  if (card.status === "unused") return;

  if (
    card.status === "redeemed" &&
    String(card.redeemedBy) === String(userId)
  ) {
    return;
  }

  const err = new Error(
    card.status === "redeemed"
      ? "This card was redeemed by another farmer"
      : `Card is ${card.status}`,
  );
  err.status = 400;
  throw err;
}

export async function assertFieldCanReceiveCard(userId, fieldId, cardId) {
  const existing = await UserSubscription.findOne({
    userId,
    fieldId,
    sourceCardId: cardId,
    status: { $in: ["active", "pending"] },
  }).lean();

  if (existing) {
    if (
      existing.status === "pending" &&
      ["card_payment_pending", "card_remainder_pending"].includes(
        existing.subscriptionPhase,
      )
    ) {
      return;
    }
    const err = new Error("This card is already applied to this field");
    err.status = 400;
    throw err;
  }

  const activeSub = await UserSubscription.findOne({
    userId,
    fieldId,
    status: "active",
  }).lean();

  if (activeSub) {
    const err = new Error("This field is already unlocked");
    err.status = 400;
    throw err;
  }
}

export async function ensureCardEntitlementForFarmer({
  userId,
  card,
  fieldId,
}) {
  let entitlement = await BiodropsAcreEntitlement.findOne({
    userId,
    sourceCardId: card._id,
  });

  if (entitlement) {
    if (new Date(entitlement.validUntil) < new Date()) {
      const err = new Error("Card entitlement has expired");
      err.status = 400;
      throw err;
    }
    return { entitlement, validUntil: entitlement.validUntil, created: false };
  }

  if (card.status !== "unused") {
    const err = new Error("Card entitlement not found");
    err.status = 400;
    throw err;
  }

  if (card.redeemBy && new Date(card.redeemBy) < new Date()) {
    card.status = "expired";
    await card.save();
    const err = new Error("Card has expired");
    err.status = 400;
    throw err;
  }

  const validUntil = new Date();
  validUntil.setMonth(validUntil.getMonth() + card.durationMonths);

  entitlement = await BiodropsAcreEntitlement.create({
    userId,
    sourceCardId: card._id,
    totalAcres: card.acreLimit,
    usedAcres: 0,
    validUntil,
    status: "active",
  });

  card.status = "redeemed";
  card.redeemedBy = userId;
  card.redeemedAt = new Date();
  await card.save();

  await logCardEvent({
    cardId: card._id,
    batchId: card.batchId,
    eventType: "redeemed",
    actorType: "farmer",
    actorId: userId,
    metadata: { fieldId, reservedForHybridCheckout: true },
  });

  return { entitlement, validUntil, created: true };
}

/** Restore card acres held by abandoned hybrid pending subs (legacy admin or Razorpay). */
export async function rollbackStaleHybridPendingSubs(userId, fieldId) {
  const stalePending = await UserSubscription.find({
    userId,
    fieldId,
    status: "pending",
    subscriptionPhase: {
      $in: ["card_payment_pending", "card_remainder_pending"],
    },
  });

  for (const sub of stalePending) {
    const cardAcres = Number(sub.cardAcres) || 0;
    if (cardAcres > 0 && sub.entitlementId) {
      const entitlement = await BiodropsAcreEntitlement.findById(
        sub.entitlementId,
      );
      if (entitlement) {
        entitlement.usedAcres = Math.max(
          0,
          (Number(entitlement.usedAcres) || 0) - cardAcres,
        );
        if (entitlement.usedAcres < entitlement.totalAcres) {
          entitlement.status = "active";
        }
        await entitlement.save();
      }
    }
  }

  if (stalePending.length > 0) {
    await UserSubscription.updateMany(
      {
        userId,
        fieldId,
        status: "pending",
        subscriptionPhase: {
          $in: ["card_payment_pending", "card_remainder_pending"],
        },
      },
      { $set: { status: "cancelled" } },
    );
  }

  return stalePending.length;
}

export async function resolveHybridCardCheckout({
  userId,
  code,
  fieldId,
}) {
  const field = await FarmField.findOne({ _id: fieldId, user: userId });
  if (!field) {
    const err = new Error("Farm field not found");
    err.status = 404;
    throw err;
  }

  const { card } = await resolveCardByCode(code);
  if (!card) {
    const err = new Error("Invalid product card code");
    err.status = 404;
    throw err;
  }

  await assertCardUsableByFarmer(userId, card);

  await rollbackStaleHybridPendingSubs(userId, field._id);

  await assertFieldCanReceiveCard(userId, field._id, card._id);

  const existingEntitlement = await BiodropsAcreEntitlement.findOne({
    userId,
    sourceCardId: card._id,
  }).lean();

  const availableAcres = getAvailableAcresForCard(card, existingEntitlement);
  const split = computeHybridAcreSplit(field.acre, availableAcres);

  if (availableAcres <= 0) {
    const err = new Error("All acres on this card have been used");
    err.status = 400;
    throw err;
  }

  return { field, card, existingEntitlement, availableAcres, split };
}

export async function finalizeHybridCardSubscription(subscription) {
  const cardAcresPlanned = Number(subscription.cardAcres) || 0;
  const alloc = await allocateAcresFromCardEntitlement(
    subscription.userId,
    subscription.sourceCardId,
    cardAcresPlanned,
  );

  const farm = await FarmField.findById(subscription.fieldId).lean();
  const fieldArea = Number(farm?.acre) || Number(subscription.area) || 1;

  subscription.area = fieldArea;
  subscription.paidAcres =
    Number(subscription.paidAcres) ||
    Math.max(0, fieldArea - (alloc.allocatedAcres || cardAcresPlanned));
  subscription.cardAcres = alloc.allocatedAcres || cardAcresPlanned;
  subscription.pendingAdminAcres = 0;
  subscription.subscriptionPhase = "active_paid";

  if (subscription.sourceCardId) {
    await logCardEvent({
      cardId: subscription.sourceCardId,
      eventType: "hybrid_payment",
      actorType: "farmer",
      actorId: subscription.userId,
      metadata: {
        fieldId: subscription.fieldId,
        subscriptionId: subscription._id,
        cardAcres: subscription.cardAcres,
        paidAcres: subscription.paidAcres,
      },
    });
  }

  return subscription;
}
