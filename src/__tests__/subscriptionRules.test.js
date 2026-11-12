/**
 * Subscription rules around the checkout: farm / area limits through the real
 * field endpoints, the nightly expiry job, pricing maths and the admin detail
 * view. In-memory MongoDB; Razorpay and the advisory generator are mocked.
 */
import { jest } from "@jest/globals";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";

jest.setTimeout(180000);
process.env.RAZORPAY_KEY_ID = "rzp_test_unit";
process.env.RAZORPAY_KEY_SECRET = "test_secret_value";

const real = await import("../services/razorpay.subscription.service.js");
jest.unstable_mockModule("../services/razorpay.subscription.service.js", () => ({
  ...real,
  razorpayClientsFor: () => [{ tag: "default" }], // no payments API: detail view must cope
}));
jest.unstable_mockModule("../features/advisory/services/triggerInitialAdvisory.service.js", () => ({
  triggerInitialAdvisoryForNewField: async () => {},
}));

const { default: SubscriptionPlan } = await import("../models/subscription-plan.model.js");
const { default: UserSubscription } = await import("../models/user-subscription.model.js");
const { default: FarmField } = await import("../models/field.model.js");
const { default: User } = await import("../models/user.model.js");
const { addField, updateField } = await import("../controllers/field/field.controller.js");
const { getSubscriptionAdminDetail } = await import("../controllers/subscription/admin.user.subscription.controller.js");
const { getAllSubscriptionPlans } = await import("../controllers/subscription-plan/get.all.subscription.plans.controller.js");
const { runSubscriptionExpiry } = await import("../worker/subscriptionExpiry.worker.js");
const pricing = await import("../utils/subscription/pricing.js");
const { FREE_TRIAL_MAX_ACRES } = await import("../utils/subscription/freeTrial.js");

let mongo;
const oid = () => new mongoose.Types.ObjectId();
const HA = 0.404686;
const mockRes = () => {
  const res = { statusCode: 200 };
  res.status = (c) => ((res.statusCode = c), res);
  res.json = (b) => ((res.body = b), res);
  return res;
};
async function seedUser() {
  const _id = oid();
  await User.collection.insertOne({ _id, firstName: "T", lastName: "U", email: `${_id}@t.test`, role: "farmer", language: "en" });
  return _id;
}
async function seedFarm(userId, acres) {
  const _id = oid();
  await FarmField.collection.insertOne({ _id, user: userId, acre: acres, fieldName: "Farm", field: [] });
  return _id;
}
const sub = (userId, fieldId, extra = {}) => ({
  _id: oid(), userId, fieldId, planId: oid(), platform: "web", area: 3, unit: "acre",
  pricePerUnitMinor: 100, totalAmountMinor: 300, billingCycle: "monthly", status: "active",
  startDate: new Date(), endDate: new Date(Date.now() + 10 * 86400000), ...extra,
});
const farmBody = (acre = 2) => ({
  latlng: [{ lat: 1, lng: 1 }, { lat: 1, lng: 2 }, { lat: 2, lng: 2 }, { lat: 1, lng: 1 }],
  cropName: "Wheat", sowingDate: "2026-11-01", typeOfIrrigation: "drip", farmName: "New farm",
  acre, typeOfFarming: "Organic",
});
const add = async (userId, body = farmBody()) => {
  const res = mockRes();
  await addField({ params: { userId: String(userId) }, user: { id: String(userId), role: "farmer" }, body }, res);
  return res;
};
const update = async (userId, fieldId, body) => {
  const res = mockRes();
  await updateField({ params: { fieldId: String(fieldId) }, user: { id: String(userId), role: "farmer" }, body }, res);
  return res;
};

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
});
afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

describe("add farm during the free trial", () => {
  const liveTrial = (userId, fieldId) =>
    sub(userId, fieldId, { billingCycle: "trial", freeTrialOffer: true, area: 3 });

  test("trial-only account: a new farm is refused with FREE_TRIAL_FARM_LIMIT", async () => {
    const userId = await seedUser();
    const farm = await seedFarm(userId, 3);
    await UserSubscription.collection.insertOne(liveTrial(userId, farm));
    const res = await add(userId);
    expect(res.statusCode).toBe(403);
    expect(res.body.code).toBe("FREE_TRIAL_FARM_LIMIT");
    expect(await FarmField.countDocuments({ user: userId })).toBe(1);
  });

  test("an account with a paid farm may still add farms during the trial", async () => {
    const userId = await seedUser();
    const trialFarm = await seedFarm(userId, 3);
    const paidFarm = await seedFarm(userId, 3);
    await UserSubscription.collection.insertMany([liveTrial(userId, trialFarm), sub(userId, paidFarm)]);
    const res = await add(userId);
    expect(res.statusCode).toBe(201);
    expect(await FarmField.countDocuments({ user: userId })).toBe(3);
  });

  test("no trial, or an ended trial: adding a farm is allowed", async () => {
    const a = await seedUser();
    expect((await add(a)).statusCode).toBe(201);

    const b = await seedUser();
    const farm = await seedFarm(b, 3);
    await UserSubscription.collection.insertOne({
      ...liveTrial(b, farm),
      endDate: new Date(Date.now() - 1000),
    });
    expect((await add(b)).statusCode).toBe(201);
  });
});

describe("area changes during the free trial", () => {
  test("the trial farm cannot grow; shrinking and other fields are fine; other farms are unaffected", async () => {
    const userId = await seedUser();
    const trialFarm = await seedFarm(userId, 3);
    const otherFarm = await seedFarm(userId, 3);
    await UserSubscription.collection.insertOne(
      sub(userId, trialFarm, { billingCycle: "trial", freeTrialOffer: true, area: 3 }),
    );

    const grow = await update(userId, trialFarm, { acre: 4 });
    expect(grow.statusCode).toBe(403);
    expect(grow.body.code).toBe("FREE_TRIAL_AREA_LIMIT");
    expect((await FarmField.collection.findOne({ _id: trialFarm })).acre).toBe(3);

    expect((await update(userId, trialFarm, { acre: 2 })).statusCode).toBe(200); // shrink
    expect((await update(userId, trialFarm, { fieldName: "Renamed" })).statusCode).toBe(200);
    expect((await update(userId, otherFarm, { acre: 9 })).statusCode).toBe(200); // not a trial farm
  });

  test("never above the 5 ha cap, even if the covered area were larger", async () => {
    const userId = await seedUser();
    const farm = await seedFarm(userId, 3);
    await UserSubscription.collection.insertOne(
      sub(userId, farm, { billingCycle: "trial", freeTrialOffer: true, area: 50 }),
    );
    const res = await update(userId, farm, { acre: FREE_TRIAL_MAX_ACRES + 1 });
    expect(res.statusCode).toBe(403);
  });
});

describe("nightly expiry job", () => {
  test("expires only active subscriptions whose end date has passed", async () => {
    const userId = await seedUser();
    const f1 = await seedFarm(userId, 1), f2 = await seedFarm(userId, 1), f3 = await seedFarm(userId, 1), f4 = await seedFarm(userId, 1);
    const due = sub(userId, f1, { endDate: new Date(Date.now() - 60000) });
    const future = sub(userId, f2);
    const pendingDue = sub(userId, f3, { status: "pending", endDate: new Date(Date.now() - 60000) });
    const cancelledDue = sub(userId, f4, { status: "cancelled", endDate: new Date(Date.now() - 60000) });
    await UserSubscription.collection.insertMany([due, future, pendingDue, cancelledDue]);

    await runSubscriptionExpiry(new Date());
    const st = async (r) => (await UserSubscription.collection.findOne({ _id: r._id })).status;
    expect(await st(due)).toBe("expired");
    expect(await st(future)).toBe("active");
    expect(await st(pendingDue)).toBe("pending");
    expect(await st(cancelledDue)).toBe("cancelled");
  });

  test("a trial past its end date expires; one converted to paid keeps running", async () => {
    const userId = await seedUser();
    const f1 = await seedFarm(userId, 1), f2 = await seedFarm(userId, 1);
    const unpaidTrial = sub(userId, f1, { billingCycle: "trial", freeTrialOffer: true, endDate: new Date(Date.now() - 1000) });
    const converted = sub(userId, f2, { billingCycle: "yearly", freeTrialOffer: true, endDate: new Date(Date.now() + 300 * 86400000) });
    await UserSubscription.collection.insertMany([unpaidTrial, converted]);
    await runSubscriptionExpiry(new Date());
    expect((await UserSubscription.collection.findOne({ _id: unpaidTrial._id })).status).toBe("expired");
    expect((await UserSubscription.collection.findOne({ _id: converted._id })).status).toBe("active");
  });
});

describe("pricing maths (server charge == what the apps display)", () => {
  const growth = { pricing: [
    { currency: "USD", billingCycle: "monthly", pricePerUnitMinor: 149, unit: "hectare" },
    { currency: "USD", billingCycle: "yearly", pricePerUnitMinor: 1490, unit: "hectare" },
  ] };
  const basic = { pricing: [
    { currency: "INR", billingCycle: "monthly", pricePerUnitMinor: 19900, unit: "acre" },
    { currency: "INR", billingCycle: "yearly", pricePerUnitMinor: 99900, unit: "acre" },
  ] };

  test("per-hectare USD plan: 1 ha costs exactly the listed per-hectare price", () => {
    const oneHaInAcres = 1 / HA;
    const d = pricing.resolveDisplayPricing(growth, oneHaInAcres, "monthly", "USD");
    expect(d.totalAmountMinor).toBe(149);
    expect(d.displayCurrency).toBe("USD");
    // stored per-acre price converts back to the per-hectare price shown in the apps
    expect(d.pricePerUnitMinor / HA).toBeCloseTo(149, 1);
  });

  test("per-acre INR plan: total = acres x price, and per-hectare equals the web/admin figure", () => {
    const d = pricing.resolveDisplayPricing(basic, 4, "monthly", "INR");
    expect(d.totalAmountMinor).toBe(79600);
    expect(d.pricePerUnitMinor / HA / 100).toBeCloseTo(491.74, 2);
    const c = pricing.resolveRazorpayChargeMinor(basic, 4, "monthly");
    expect(c).toEqual({ chargedMinor: 79600, source: "INR" });
  });

  test("USD plan is charged in INR at the configured rate", () => {
    const rate = real.USD_INR_RATE();
    const c = pricing.resolveRazorpayChargeMinor(growth, 1 / HA, "monthly");
    expect(c.source).toBe("USD_FX");
    expect(c.chargedMinor).toBe(Math.round(149 * rate));
  });

  test("missing price for a cycle -> null; tiny farms are charged at least ₹1", () => {
    expect(pricing.resolveDisplayPricing(growth, 2, "season", "USD")).toBeNull();
    expect(pricing.resolveRazorpayChargeMinor(growth, 2, "season")).toBeNull();
    expect(pricing.resolveRazorpayChargeMinor({ pricing: [{ currency: "INR", billingCycle: "monthly", pricePerUnitMinor: 1, unit: "acre" }] }, 0.01, "monthly").chargedMinor).toBe(100);
  });

  test("billing pattern / term bounds", () => {
    expect(pricing.billingCycleFromBillingPattern("twelve_monthly")).toBe("monthly");
    expect(pricing.billingCycleFromBillingPattern("season")).toBe("season");
    expect(pricing.billingCycleFromBillingPattern("yearly")).toBe("yearly");
    expect(pricing.billingPatternFromBillingCycle("monthly")).toBe("twelve_monthly");
    const now = new Date("2026-01-31T00:00:00Z");
    const y = pricing.computeRecurringTermBounds("yearly", now);
    expect(y.termEnd.getUTCFullYear()).toBe(2027);
    const m = pricing.computeRecurringTermBounds("monthly", now);
    expect(m.periodEnd.getTime()).toBeGreaterThan(now.getTime());
    expect(m.termEnd.getUTCFullYear()).toBe(2027);
  });
});

describe("admin detail view", () => {
  test("returns the free-trial fields, populated plan names and survives Razorpay lookups failing", async () => {
    const userId = await seedUser();
    const farm = await seedFarm(userId, 3);
    const planId = oid();
    await SubscriptionPlan.collection.insertOne({ _id: planId, name: "Growth Plan", slug: "gp-x", brand: "cropgen", platform: "web", active: true, pricing: [], features: {} });
    const row = sub(userId, farm, {
      planId, postTrialPlanId: planId, billingCycle: "trial", freeTrialOffer: true,
      commitBillingCycle: "yearly", subscriptionPhase: "trial_mandate_saved",
      razorpaySubscriptionId: "sub_detail", razorpayPaymentId: "pay_detail",
    });
    await UserSubscription.collection.insertOne(row);

    const res = mockRes();
    await getSubscriptionAdminDetail({ params: { id: String(row._id) }, user: { id: String(oid()), role: "admin" } }, res);
    expect(res.statusCode).toBe(200);
    const s = res.body.data.subscription;
    expect(s.freeTrialOffer).toBe(true);
    expect(s.commitBillingCycle).toBe("yearly");
    expect(s.postTrialPlanId.name).toBe("Growth Plan");
    expect(s.planId.name).toBe("Growth Plan");
    expect(res.body.data.razorpayPayments[0].fetchError).toBe(true); // lookup failed gracefully
  });
});

describe("plan list tells the app whether the free trial was already used", () => {
  const list = async (userId, platform = "web") => {
    const res = mockRes();
    await getAllSubscriptionPlans({ query: { platform }, user: userId ? { id: String(userId), role: "farmer" } : undefined, headers: {} }, res);
    return res.body.data.find((p) => p.slug === "pro-plan-trial");
  };

  test("offer.used is false for new / anonymous callers and true after the trial started", async () => {
    await SubscriptionPlan.collection.insertOne({
      _id: oid(), name: "Growth Plan", slug: "pro-plan-trial", brand: "cropgen", platform: "web", active: true, pricing: [], features: {},
    });
    process.env.FREE_TRIAL_PLAN_SLUG = "pro-plan-trial";
    try {
      const userId = await seedUser();
      expect((await list(null)).freeTrialOffer.used).toBe(false);
      expect((await list(userId)).freeTrialOffer.used).toBe(false);

      // abandoned checkout (autopay never saved) does not count
      const farm = await seedFarm(userId, 2);
      await UserSubscription.collection.insertOne(sub(userId, farm, { billingCycle: "trial", freeTrialOffer: true, status: "pending", subscriptionPhase: "trial_mandate_pending" }));
      expect((await list(userId)).freeTrialOffer.used).toBe(false);

      await UserSubscription.collection.updateMany({ userId }, { $set: { status: "active", subscriptionPhase: "trial_mandate_saved" } });
      expect((await list(userId)).freeTrialOffer.used).toBe(true);
      expect((await list(await seedUser())).freeTrialOffer.used).toBe(false); // someone else
    } finally {
      delete process.env.FREE_TRIAL_PLAN_SLUG;
    }
  });
});
