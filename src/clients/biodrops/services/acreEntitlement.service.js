import BiodropsAcreEntitlement from "../models/biodrops-acre-entitlement.model.js";
import UserSubscription from "../../../models/user-subscription.model.js";
import BiodropsProductCard from "../models/biodrops-product-card.model.js";

export async function getActiveEntitlements(userId) {
  const now = new Date();
  return BiodropsAcreEntitlement.find({
    userId,
    status: "active",
    validUntil: { $gt: now },
  })
    .sort({ validUntil: 1 })
    .lean();
}

export async function getPoolSummary(userId) {
  const rows = await getActiveEntitlements(userId);
  let totalAcres = 0;
  let usedAcres = 0;
  let validUntil = null;

  for (const row of rows) {
    totalAcres += Number(row.totalAcres) || 0;
    usedAcres += Number(row.usedAcres) || 0;
    if (!validUntil || new Date(row.validUntil) > validUntil) {
      validUntil = new Date(row.validUntil);
    }
  }

  return {
    totalAcres,
    usedAcres,
    remainingAcres: Math.max(0, totalAcres - usedAcres),
    validUntil,
    entitlements: rows,
  };
}

export async function allocateAcresFromPool(userId, acresNeeded) {
  const entitlements = await getActiveEntitlements(userId);
  let remaining = acresNeeded;
  const allocations = [];

  for (const ent of entitlements) {
    if (remaining <= 0) break;

    const doc = await BiodropsAcreEntitlement.findById(ent._id);
    if (!doc || doc.status !== "active") continue;

    const available =
      Number(doc.totalAcres) - (Number(doc.usedAcres) || 0);
    if (available <= 0) {
      doc.status = "exhausted";
      await doc.save();
      continue;
    }

    const take = Math.min(available, remaining);
    doc.usedAcres = (Number(doc.usedAcres) || 0) + take;
    if (doc.usedAcres >= doc.totalAcres) {
      doc.status = "exhausted";
    }
    await doc.save();

    allocations.push({ entitlementId: doc._id, acres: take });
    remaining -= take;
  }

  return {
    allocatedAcres: acresNeeded - remaining,
    remainingAcresToPay: remaining,
    allocations,
  };
}

export async function allocateAcresFromCardEntitlement(
  userId,
  cardId,
  acresNeeded,
) {
  const now = new Date();
  const doc = await BiodropsAcreEntitlement.findOne({
    userId,
    sourceCardId: cardId,
    status: "active",
    validUntil: { $gt: now },
  });

  if (!doc) {
    return {
      allocatedAcres: 0,
      remainingAcresToPay: acresNeeded,
      entitlementId: null,
    };
  }

  const available =
    Number(doc.totalAcres) - (Number(doc.usedAcres) || 0);
  if (available <= 0) {
    doc.status = "exhausted";
    await doc.save();
    return {
      allocatedAcres: 0,
      remainingAcresToPay: acresNeeded,
      entitlementId: doc._id,
    };
  }

  const take = Math.min(available, acresNeeded);
  doc.usedAcres = (Number(doc.usedAcres) || 0) + take;
  if (doc.usedAcres >= doc.totalAcres) {
    doc.status = "exhausted";
  }
  await doc.save();

  return {
    allocatedAcres: take,
    remainingAcresToPay: Math.max(0, acresNeeded - take),
    entitlementId: doc._id,
  };
}

export async function getFarmerCardSummaries(farmerId) {
  const cards = await BiodropsProductCard.find({ redeemedBy: farmerId })
    .populate("batchId", "label productName productSku")
    .sort({ redeemedAt: -1 })
    .lean();

  return Promise.all(
    cards.map(async (card) => {
      const usage = await getCardUsageSummary(card._id, card.acreLimit);
      return {
        id: String(card._id),
        codePrefix: card.codePrefix,
        acreLimit: card.acreLimit,
        durationMonths: card.durationMonths,
        status: card.status,
        redeemedAt: card.redeemedAt,
        batch: {
          label: card.batchId?.label || null,
          productName: card.batchId?.productName || null,
          productSku: card.batchId?.productSku || null,
        },
        usage,
      };
    }),
  );
}

function buildUsageNumbers(totalAcres, usedAcres) {
  const total = Number(totalAcres) || 0;
  const used = Number(usedAcres) || 0;
  return {
    totalAcres: total,
    usedAcres: used,
    remainingAcres: Math.max(0, total - used),
  };
}

export async function getCardUsageSummary(cardId, cardAcreLimit = 0) {
  const entitlement = await BiodropsAcreEntitlement.findOne({
    sourceCardId: cardId,
  }).lean();

  const subscriptions = await UserSubscription.find({ sourceCardId: cardId })
    .populate("fieldId", "fieldName acre")
    .populate("userId", "firstName lastName phone")
    .sort({ createdAt: -1 })
    .lean();

  const totalAcres = entitlement
    ? Number(entitlement.totalAcres) || 0
    : Number(cardAcreLimit) || 0;
  const usedAcres = entitlement ? Number(entitlement.usedAcres) || 0 : 0;
  const usage = buildUsageNumbers(totalAcres, usedAcres);

  let pendingAdminAcres = 0;
  const fieldAllocations = subscriptions.map((sub) => {
    const pending = Number(sub.pendingAdminAcres) || 0;
    pendingAdminAcres += pending;
    const field = sub.fieldId;
    return {
      subscriptionId: String(sub._id),
      fieldId: field?._id ? String(field._id) : null,
      fieldName: field?.fieldName || "—",
      fieldAcres: Number(field?.acre) || 0,
      cardAcres: Number(sub.cardAcres) || 0,
      pendingAdminAcres: pending,
      status: sub.status,
      activationSource: sub.activationSource || null,
      farmer: sub.userId
        ? {
            id: String(sub.userId._id),
            name:
              [sub.userId.firstName, sub.userId.lastName]
                .filter(Boolean)
                .join(" ")
                .trim() || "Farmer",
            phone: sub.userId.phone || null,
          }
        : null,
    };
  });

  return {
    ...usage,
    pendingAdminAcres,
    entitlementStatus: entitlement?.status || null,
    validUntil: entitlement?.validUntil || null,
    entitlementId: entitlement?._id ? String(entitlement._id) : null,
    fieldAllocations,
  };
}

export async function getCardUsageSummariesByCardIds(cards = []) {
  if (!cards.length) return new Map();

  const cardIds = cards.map((card) => card._id);
  const [entitlements, subscriptions] = await Promise.all([
    BiodropsAcreEntitlement.find({ sourceCardId: { $in: cardIds } }).lean(),
    UserSubscription.find({ sourceCardId: { $in: cardIds } })
      .select("sourceCardId pendingAdminAcres")
      .lean(),
  ]);

  const entitlementByCardId = new Map(
    entitlements.map((row) => [String(row.sourceCardId), row]),
  );

  const pendingByCardId = new Map();
  for (const sub of subscriptions) {
    const key = String(sub.sourceCardId);
    const pending = Number(sub.pendingAdminAcres) || 0;
    pendingByCardId.set(key, (pendingByCardId.get(key) || 0) + pending);
  }

  const summaries = new Map();
  for (const card of cards) {
    const key = String(card._id);
    const entitlement = entitlementByCardId.get(key);
    const totalAcres = entitlement
      ? Number(entitlement.totalAcres) || 0
      : Number(card.acreLimit) || 0;
    const usedAcres = entitlement ? Number(entitlement.usedAcres) || 0 : 0;

    summaries.set(key, {
      ...buildUsageNumbers(totalAcres, usedAcres),
      pendingAdminAcres: pendingByCardId.get(key) || 0,
      entitlementStatus: entitlement?.status || null,
    });
  }

  return summaries;
}
