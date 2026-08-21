import FarmField from "../../models/field.model.js";
import SubscriptionPlan from "../../models/subscription-plan.model.js";
import UserSubscription from "../../models/user-subscription.model.js";
import { createSubscriptionActivationNotification } from "../../services/notification.service.js";
import {
  getRazorpay,
  ensureRazorpayCustomer,
  createRazorpayPlan,
  createRazorpaySubscription,
  createPostTrialRazorpaySubscription,
  cancelRazorpaySubscriptionBestEffort,
  formatRazorpayApiError,
  YEARLY_TOTAL_COUNT,
  MONTHLY_COMMIT_TOTAL_COUNT,
  SEASON_SINGLE_TOTAL_COUNT,
} from "../../services/razorpay.subscription.service.js";
import {
  billingPatternFromBillingCycle,
  resolveRazorpayChargeMinor,
  resolveDisplayPricing,
} from "../../utils/subscription/pricing.js";
import { resolveSubscriptionPlanBrand } from "../../utils/auth/authUtils.js";
import { assertAatFieldWithinPlan, aatChargeArea } from "../../utils/subscription/aatPlan.js";
import { createBiodropsCardHybridOrder } from "../../clients/biodrops/controllers/subscriptions/card-hybrid-order.controller.js";

const razorpay = getRazorpay();

/** Web: fixed 7-day trial per field (mobile still uses plan.trialDays when set). */
const WEB_TRIAL_DAYS = 7;

/**
 * Ends any live trial rows for this farm (cancel Razorpay sub if present, mark cancelled)
 * so a new trial checkout can start without hitting the unique trial index or duplicate rules.
 */
async function cancelLiveTrialsForField(userId, fieldId) {
  const live = await UserSubscription.find({
    userId,
    fieldId,
    billingCycle: "trial",
    status: { $in: ["active", "pending"] },
  }).lean();

  for (const row of live) {
    await cancelRazorpaySubscriptionBestEffort(
      razorpay,
      row.razorpaySubscriptionId,
    );
    await UserSubscription.updateOne(
      { _id: row._id },
      { $set: { status: "cancelled" } },
    );
  }
}

/** Old DB index was unique on user + billingCycle (or userId + billingCycle) — blocked a second farm's trial. */
function looksLikeLegacyUserTrialIndexError(error) {
  if (error?.code !== 11000) return false;
  const msg = String(
    error.message || error.errmsg || error.errorResponse?.errmsg || "",
  );
  if (
    /userId_1_billingCycle_1|user_1_billingCycle_1/i.test(msg)
  ) {
    return true;
  }
  const kp = error.keyPattern;
  if (!kp || typeof kp !== "object") return false;
  if (Object.prototype.hasOwnProperty.call(kp, "fieldId")) return false;
  const hasUserKey =
    Object.prototype.hasOwnProperty.call(kp, "userId") ||
    Object.prototype.hasOwnProperty.call(kp, "user");
  return (
    hasUserKey && Object.prototype.hasOwnProperty.call(kp, "billingCycle")
  );
}

const LEGACY_TRIAL_INDEX_MESSAGE =
  "Database still has an old one-trial-per-account index. In MongoDB run: db.usersubscriptions.dropIndex('userId_1_billingCycle_1') and dropIndex('user_1_billingCycle_1') if present, then restart the API (syncIndexes runs on boot).";

/**
 * Inserts trial row; on duplicate (same field, stale pending/active), cancel live trials and retry once.
 * Surfaces legacy index errors with an actionable message instead of a generic conflict.
 */
async function createUserSubscriptionTrialDocWithRetry(userId, fieldId, doc) {
  const throwIfLegacy = (e) => {
    if (looksLikeLegacyUserTrialIndexError(e)) {
      const err = new Error(LEGACY_TRIAL_INDEX_MESSAGE);
      err.isLegacyTrialIndex = true;
      throw err;
    }
  };

  try {
    return await UserSubscription.create(doc);
  } catch (e1) {
    if (e1.code !== 11000) throw e1;
    throwIfLegacy(e1);
    await cancelLiveTrialsForField(userId, fieldId);
    try {
      return await UserSubscription.create(doc);
    } catch (e2) {
      if (e2.code !== 11000) throw e2;
      throwIfLegacy(e2);
      throw e2;
    }
  }
}

export const createSubscriptionOrder = async (req, res) => {
  try {
    const userId = req.user?.id || req.user?._id;
    const {
      farmId,
      planId,
      billingCycle,
      displayCurrency: bodyDisplayCurrency,
      /** Billing cycle that starts after trial ends (monthly | yearly | season). */
      commitBillingCycle: bodyCommitCycle,
      cardCode,
    } = req.body;

    const planBrand = resolveSubscriptionPlanBrand(req);

    if (planBrand === "biodrops" && cardCode) {
      return createBiodropsCardHybridOrder(req, res);
    }

    const farm = await FarmField.findOne({
      _id: farmId,
      user: userId,
    });

    if (!farm) {
      return res.status(404).json({ message: "Farm not found" });
    }

    const plan = await SubscriptionPlan.findOne({
      _id: planId,
      active: true,
      brand: planBrand,
    });

    if (!plan) {
      return res.status(404).json({
        message: "Plan not found for this app",
      });
    }

    const fieldArea = Number(farm.acre) || 1;
    const startDate = new Date();
    let cardAcresApplied = 0;
    let razorpayBillableArea = fieldArea;

    if (planBrand === "biodrops") {
      const { allocateAcresFromPool, getPoolSummary } = await import(
        "../../clients/biodrops/services/acreEntitlement.service.js"
      );
      const pool = await getPoolSummary(userId);
      if (pool.remainingAcres > 0) {
        const alloc = await allocateAcresFromPool(userId, fieldArea);
        cardAcresApplied = alloc.allocatedAcres;
        razorpayBillableArea = Math.max(0, alloc.remainingAcresToPay);
      }

      if (razorpayBillableArea <= 0 && cardAcresApplied > 0) {
        const poolAfter = await getPoolSummary(userId);
        const validUntil =
          poolAfter.validUntil || new Date(Date.now() + 365 * 86400000);
        await UserSubscription.updateMany(
          { userId, fieldId: farmId, status: "active" },
          { $set: { status: "expired" } },
        );
        const subscription = await UserSubscription.create({
          userId,
          fieldId: farmId,
          planId,
          platform: plan.platform,
          area: fieldArea,
          unit: "acre",
          billingCycle: "yearly",
          displayCurrency: "INR",
          pricePerUnitMinor: 0,
          totalAmountMinor: 0,
          status: "active",
          startDate,
          endDate: validUntil,
          activationSource: "product_card",
          cardAcres: cardAcresApplied,
          paidAcres: 0,
          billingMode: "legacy_order",
        });
        return res.status(201).json({
          success: true,
          type: "card_pool",
          subscriptionId: subscription._id,
          fieldUnlocked: true,
          cardAcresApplied,
          fieldAcres: fieldArea,
        });
      }
    }

    const aatLimitMessage = assertAatFieldWithinPlan(plan, fieldArea);
    if (aatLimitMessage) {
      return res.status(400).json({ message: aatLimitMessage });
    }

    const area = planBrand === "biodrops" ? razorpayBillableArea : fieldArea;
    const chargeArea = aatChargeArea(planBrand, area);
    const coverageArea = planBrand === "aat" ? fieldArea : area;

    /* ================= TRIAL + POST-TRIAL (web + mobile: one Razorpay subscription, charge at trial end via start_at) ================= */
    const webPaidAsTrial =
      plan.platform === "web" &&
      ["monthly", "yearly", "season"].includes(billingCycle);

    const mobilePaidAsTrial =
      plan.platform === "mobile" &&
      plan.isTrialEnabled &&
      ["monthly", "yearly", "season"].includes(billingCycle);

    if (billingCycle === "trial" || webPaidAsTrial || mobilePaidAsTrial) {
      if (!plan.isTrialEnabled && plan.platform !== "web") {
        return res
          .status(400)
          .json({ message: "Trial not available for this plan" });
      }

      await cancelLiveTrialsForField(userId, farmId);

      const trialDayCount =
        plan.platform === "web"
          ? WEB_TRIAL_DAYS
          : plan.trialDays >= 1
            ? plan.trialDays
            : 7;
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + trialDayCount);

      const commitBillingCycle =
        webPaidAsTrial || mobilePaidAsTrial
          ? billingCycle
          : bodyCommitCycle || "yearly";
      if (!["monthly", "yearly", "season"].includes(commitBillingCycle)) {
        return res.status(400).json({
          message:
            "commitBillingCycle must be monthly, yearly, or season for trial checkout",
        });
      }

      const trialDisplayCurrency = bodyDisplayCurrency || "USD";

      const charge = resolveRazorpayChargeMinor(plan, chargeArea, commitBillingCycle);
      let display = resolveDisplayPricing(
        plan,
        chargeArea,
        commitBillingCycle,
        trialDisplayCurrency,
      );
      if (!display) {
        display = resolveDisplayPricing(
          plan,
          chargeArea,
          commitBillingCycle,
          "INR",
        );
      }

      /* No pricing for post-trial period → legacy free trial (no mandate). */
      if (!charge || !display) {
        try {
          const subscription = await createUserSubscriptionTrialDocWithRetry(
            userId,
            farmId,
            {
              userId,
              fieldId: farmId,
              planId,
              platform: plan.platform,
              area: coverageArea,
              unit: "acre",
              billingCycle: "trial",
              displayCurrency: null,
              pricePerUnitMinor: 0,
              totalAmountMinor: 0,
              chargedCurrency: null,
              exchangeRate: null,
              status: "active",
              startDate,
              endDate,
              billingMode: "legacy_order",
            },
          );

          return res.status(201).json({
            success: true,
            type: "trial",
            subscriptionId: subscription._id,
            startDate,
            endDate,
            daysLeft: trialDayCount,
          });
        } catch (error) {
          if (error.isLegacyTrialIndex) {
            return res.status(409).json({ message: error.message });
          }
          if (error.code === 11000) {
            return res.status(409).json({
              message:
                "Trial checkout conflict. Wait a moment and try again, or refresh the page.",
            });
          }
          console.error("Trial creation failed:", error);
          return res.status(500).json({
            message: "Failed to create trial subscription",
          });
        }
      }

      try {
        const subscription = await createUserSubscriptionTrialDocWithRetry(
          userId,
          farmId,
          {
            userId,
            fieldId: farmId,
            planId,
            platform: plan.platform,
            area: coverageArea,
            unit: "acre",
            billingCycle: "trial",
            commitBillingCycle,
            displayCurrency: display.displayCurrency,
            pricePerUnitMinor: display.pricePerUnitMinor,
            totalAmountMinor: display.totalAmountMinor,
            chargedCurrency: "INR",
            exchangeRate: display.exchangeRate,
            /* pending until Razorpay checkout completes (mandate / first payment). */
            status: "pending",
            startDate,
            endDate,
            billingMode: "recurring",
            postTrialPlanId: plan._id,
            trialEndsAt: endDate,
            subscriptionPhase: "trial_mandate_pending",
          },
        );

        await ensureRazorpayCustomer(razorpay, userId);

        const { rzPlan, rzSub, billingPattern } =
          await createPostTrialRazorpaySubscription({
            razorpay,
            userId,
            userSubscriptionId: subscription._id,
            plan,
            area: chargeArea,
            commitBillingCycle,
            trialEndDate: endDate,
          });

        subscription.razorpaySubscriptionId = rzSub.id;
        subscription.razorpayPlanId = rzPlan.id;
        subscription.billingPattern = billingPattern;
        await subscription.save();

        return res.status(201).json({
          success: true,
          type: "trial_with_mandate",
          subscriptionId: subscription._id,
          startDate,
          endDate,
          daysLeft: trialDayCount,
          razorpay: {
            subscription_id: rzSub.id,
            key: process.env.RAZORPAY_KEY_ID,
          },
        });
      } catch (error) {
        if (error.isLegacyTrialIndex) {
          return res.status(409).json({ message: error.message });
        }
        if (error.code === 11000) {
          return res.status(409).json({
            message:
              "Trial checkout conflict. Wait a moment and try again, or refresh the page.",
          });
        }
        console.error("Trial + mandate creation failed:", error);
        const { message, status } = formatRazorpayApiError(error);
        return res.status(status).json({ message });
      }
    }

    /* ================= PAID (all cycles use Razorpay Subscriptions — no Orders API) ================= */
    if (!bodyDisplayCurrency) {
      return res.status(400).json({ message: "Currency is required" });
    }
    const displayCurrency = bodyDisplayCurrency;

    const pricing = plan.pricing.find(
      (pr) => pr.currency === displayCurrency && pr.billingCycle === billingCycle,
    );

    if (!pricing) {
      return res.status(400).json({ message: "Pricing not found" });
    }

    const displayAmountMinor = Math.round(chargeArea * pricing.pricePerUnitMinor);
    let exchangeRate = null;
    if (displayCurrency === "USD") {
      exchangeRate = Number(process.env.RAZORPAY_USD_INR_RATE || "91.46");
    }

    const chargeResolved = resolveRazorpayChargeMinor(plan, chargeArea, billingCycle);
    if (!chargeResolved) {
      return res.status(400).json({
        message: "Could not resolve INR charge for this plan and billing cycle",
      });
    }
    const chargedAmountMinor = chargeResolved.chargedMinor;

    const endDate = new Date(startDate);
    if (billingCycle === "monthly") {
      endDate.setMonth(endDate.getMonth() + 1);
    } else if (billingCycle === "yearly") {
      endDate.setFullYear(endDate.getFullYear() + 1);
    } else if (billingCycle === "season") {
      endDate.setDate(endDate.getDate() + 120);
    }

    const subscription = await UserSubscription.create({
      userId,
      fieldId: farmId,
      planId,
      platform: plan.platform,
      area: coverageArea,
      unit: "acre",
      billingCycle,
      displayCurrency,
      pricePerUnitMinor: pricing.pricePerUnitMinor,
      totalAmountMinor: displayAmountMinor,
      chargedCurrency: "INR",
      exchangeRate,
      status: "pending",
      startDate,
      endDate,
    });

    const { customerId } = await ensureRazorpayCustomer(razorpay, userId);

    let period = "monthly";
    let totalCount = MONTHLY_COMMIT_TOTAL_COUNT;
    let billingPattern = "twelve_monthly";

    if (billingCycle === "yearly") {
      period = "yearly";
      totalCount = YEARLY_TOTAL_COUNT;
      billingPattern = "yearly";
    } else if (billingCycle === "season") {
      period = "monthly";
      totalCount = SEASON_SINGLE_TOTAL_COUNT;
      billingPattern = "season";
    }

    const rzPlan = await createRazorpayPlan(razorpay, {
      period,
      interval: 1,
      itemName: `CropGen ${plan.slug} ${String(subscription._id).slice(-8)}`,
      amountMinor: chargedAmountMinor,
      description: `${chargeArea} ${planBrand === "aat" ? "package" : "acres"} ${billingCycle}`,
    });

    const rzSub = await createRazorpaySubscription(razorpay, {
      planId: rzPlan.id,
      customerId,
      startAtUnix: undefined,
      totalCount,
      notes: {
        userSubscriptionId: String(subscription._id),
        cropgenUserId: String(userId),
        flow: "paid_recurring",
      },
    });

    subscription.razorpaySubscriptionId = rzSub.id;
    subscription.razorpayPlanId = rzPlan.id;
    subscription.billingMode = "recurring";
    subscription.billingPattern = billingPattern;
    await subscription.save();

    return res.status(201).json({
      success: true,
      type: "subscription",
      subscriptionId: subscription._id,
      startDate,
      endDate,
      razorpay: {
        subscription_id: rzSub.id,
        key: process.env.RAZORPAY_KEY_ID,
      },
    });
  } catch (error) {
    console.error("Create subscription order failed:", error);
    const { message, status } = formatRazorpayApiError(error);
    return res.status(status).json({ message });
  }
};
