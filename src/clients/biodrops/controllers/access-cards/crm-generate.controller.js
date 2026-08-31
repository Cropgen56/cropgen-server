import BiodropsCardBatch from "../../models/biodrops-card-batch.model.js";
import BiodropsProductCard from "../../models/biodrops-product-card.model.js";
import SubscriptionPlan from "../../../../models/subscription-plan.model.js";
import {
  generateCardCode,
  hashCardCode,
  cardCodePrefix,
} from "../../utils/cardCode.js";
import { logCardEvent } from "../../services/cardEvent.service.js";
import {
  getCardUsageSummary,
  getCardUsageSummariesByCardIds,
} from "../../services/acreEntitlement.service.js";

export async function generateAccessCards(req, res) {
  try {
    const adminId = req.user?.id || req.user?._id;
    const {
      label,
      productSku,
      productName,
      planId,
      durationMonths,
      quantity,
      redeemBy,
      notes,
    } = req.body || {};

    if (!label || !planId || !durationMonths || !quantity) {
      return res.status(400).json({
        success: false,
        message: "label, planId, durationMonths, and quantity are required",
      });
    }

    if (
      !Number.isInteger(Number(durationMonths)) ||
      Number(durationMonths) < 1 ||
      Number(durationMonths) > 12
    ) {
      return res.status(400).json({
        success: false,
        message: "durationMonths must be an integer between 1 and 12",
      });
    }

    // Cards are always tied to a real acre-package plan — the acre limit
    // printed on the card comes from the plan, never typed separately, so
    // redemption is guaranteed to find a match.
    const plan = await SubscriptionPlan.findOne({
      _id: planId,
      brand: "biodrops",
      active: true,
    }).lean();

    if (!plan) {
      return res.status(404).json({
        success: false,
        message: "Selected plan not found or is not an active BioDrops plan",
      });
    }

    if (!(Number(plan.maxAcres) > 0)) {
      return res.status(400).json({
        success: false,
        message:
          "This plan has no acre package configured (Max acres covered) — cards can only be linked to acre-package plans",
      });
    }

    const count = Math.min(Math.max(Number(quantity), 1), 10000);

    const batch = await BiodropsCardBatch.create({
      label: String(label).trim(),
      productSku: productSku || null,
      productName: productName || null,
      planId: plan._id,
      acreLimit: Number(plan.maxAcres),
      durationMonths: Number(durationMonths),
      quantity: count,
      redeemBy: redeemBy ? new Date(redeemBy) : null,
      notes: notes || null,
      createdBy: adminId,
    });

    const codes = [];
    const cardDocs = [];

    for (let i = 0; i < count; i++) {
      let plainCode;
      let codeHash;
      let attempts = 0;

      do {
        plainCode = generateCardCode();
        codeHash = hashCardCode(plainCode);
        attempts += 1;
      } while (
        attempts < 10 &&
        (cardDocs.some((c) => c.codeHash === codeHash) ||
          (await BiodropsProductCard.exists({ codeHash })))
      );

      cardDocs.push({
        batchId: batch._id,
        codeHash,
        codePrefix: cardCodePrefix(plainCode),
        planId: batch.planId,
        acreLimit: batch.acreLimit,
        durationMonths: batch.durationMonths,
        redeemBy: batch.redeemBy,
        status: "unused",
      });

      codes.push({
        code: plainCode,
        acreLimit: batch.acreLimit,
        durationMonths: batch.durationMonths,
        qrUrl: `satagro://unlock?code=${encodeURIComponent(plainCode)}`,
      });
    }

    const inserted = await BiodropsProductCard.insertMany(cardDocs);
    const codesWithIds = codes.map((row, index) => ({
      ...row,
      cardId: inserted[index]?._id?.toString() || null,
    }));

    await logCardEvent({
      batchId: batch._id,
      eventType: "batch_created",
      actorType: "admin",
      actorId: adminId,
      metadata: { quantity: count, label: batch.label },
    });

    return res.status(201).json({
      success: true,
      batchId: batch._id,
      label: batch.label,
      quantity: count,
      planId: plan._id,
      planName: plan.name,
      acreLimit: batch.acreLimit,
      codes: codesWithIds,
      message: "Store codes securely — they cannot be retrieved again.",
    });
  } catch (error) {
    console.error("generateAccessCards:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to generate cards",
    });
  }
}

export async function listAccessCards(req, res) {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const skip = (page - 1) * limit;

    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.batchId) filter.batchId = req.query.batchId;

    const [items, total] = await Promise.all([
      BiodropsProductCard.find(filter)
        .populate("planId", "name maxAcres")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      BiodropsProductCard.countDocuments(filter),
    ]);

    const usageByCardId = await getCardUsageSummariesByCardIds(items);
    const data = items.map((card) => ({
      ...card,
      usage: usageByCardId.get(String(card._id)) || {
        totalAcres: Number(card.acreLimit) || 0,
        usedAcres: 0,
        remainingAcres: Number(card.acreLimit) || 0,
        pendingAdminAcres: 0,
        entitlementStatus: null,
      },
    }));

    return res.status(200).json({
      success: true,
      data,
      pagination: { page, limit, total },
    });
  } catch (error) {
    console.error("listAccessCards:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to list cards",
    });
  }
}

export async function getAccessCardById(req, res) {
  try {
    const { id } = req.params;
    const card = await BiodropsProductCard.findById(id)
      .populate("redeemedBy", "firstName lastName phone email")
      .populate("batchId", "label productName productSku")
      .populate("planId", "name maxAcres")
      .lean();

    if (!card) {
      return res.status(404).json({
        success: false,
        message: "Card not found",
      });
    }

    const usage = await getCardUsageSummary(card._id, card.acreLimit);

    return res.status(200).json({
      success: true,
      data: {
        ...card,
        usage,
      },
    });
  } catch (error) {
    console.error("getAccessCardById:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch card",
    });
  }
}

export async function getAccessCardEvents(req, res) {
  try {
    const { id } = req.params;
    const BiodropsCardEvent = (
      await import("../../models/biodrops-card-event.model.js")
    ).default;

    const events = await BiodropsCardEvent.find({ cardId: id })
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json({ success: true, data: events });
  } catch (error) {
    console.error("getAccessCardEvents:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch card events",
    });
  }
}
