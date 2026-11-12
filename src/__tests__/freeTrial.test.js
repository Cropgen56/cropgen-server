/**
 * CropGen 21-day Free Trial (USD web, Growth plan, autopay required).
 * In-memory MongoDB and a mocked Razorpay service: nothing touches .env data
 * or the network.
 */
import { jest } from "@jest/globals";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";

jest.setTimeout(120000);

const rz = {
  getRazorpay: jest.fn(() => ({})),
  getRazorpayCredentials: jest.fn(() => ({ keyId: "rzp_test_x" })),
  razorpayClientsFor: jest.fn(() => []),
  razorpayBrandLabel: jest.fn(() => "CropGen"),
  ensureRazorpayCustomer: jest.fn(async () => ({})),
  createRazorpayPlan: jest.fn(async () => ({ id: "plan_x" })),
  createRazorpaySubscription: jest.fn(async () => ({ id: "sub_x" })),
  createPostTrialRazorpaySubscription: jest.fn(async () => ({
    rzPlan: { id: "plan_x" },
    rzSub: { id: "sub_x" },
    billingPattern: "twelve_monthly",
  })),
  cancelRazorpaySubscriptionBestEffort: jest.fn(async () => {}),
  formatRazorpayApiError: jest.fn(() => ({ message: "razorpay", status: 502 })),
  YEARLY_TOTAL_COUNT: 30,
  MONTHLY_COMMIT_TOTAL_COUNT: 12,
  SEASON_SINGLE_TOTAL_COUNT: 1,
};
const realRazorpayService = await import("../services/razorpay.subscription.service.js");
jest.unstable_mockModule("../services/razorpay.subscription.service.js", () => ({
  ...realRazorpayService,
  ...rz,
}));

const { default: SubscriptionPlan } = await import("../models/subscription-plan.model.js");
const { default: UserSubscription } = await import("../models/user-subscription.model.js");
const { default: FarmField } = await import("../models/field.model.js");
const { getUserSubscriptions } = await import(
  "../controllers/subscription/user.subscription.controller.js"
);
const { createSubscriptionOrder } = await import(
  "../controllers/subscription/create.subscription.order.controller.js"
);
const {
  getLiveFreeTrial,
  freeTrialBlocksNewFarm,
  userHasPaidSubscription,
  userHasUsedFreeTrial,
  isFreeTrialPlan,
  freeTrialOffer,
  FREE_TRIAL_DAYS,
  FREE_TRIAL_MAX_HECTARES,
  FREE_TRIAL_MAX_ACRES,
} = await import("../utils/subscription/freeTrial.js");

let mongo;
const oid = () => new mongoose.Types.ObjectId();
const HA = 0.404686;

const pricing = [
  { currency: "USD", billingCycle: "monthly", pricePerUnitMinor: 149, unit: "hectare" },
  { currency: "USD", billingCycle: "yearly", pricePerUnitMinor: 1490, unit: "hectare" },
];

async function seedPlan(overrides = {}) {
  const _id = oid();
  await SubscriptionPlan.collection.insertOne({
    _id,
    name: "Growth Plan",
    slug: "pro-plan",
    brand: "cropgen",
    platform: "web",
    active: true,
    pricing,
    features: {},
    ...overrides,
  });
  return _id;
}

async function seedFarm(userId, hectares) {
  const _id = oid();
  await FarmField.collection.insertOne({ _id, user: userId, acre: hectares / HA, fieldName: "f" });
  return _id;
}

const mockRes = () => {
  const res = { statusCode: 200 };
  res.status = (c) => ((res.statusCode = c), res);
  res.json = (b) => ((res.body = b), res);
  return res;
};

async function order({ userId, farmId, planId, body = {} }) {
  const res = mockRes();
  await createSubscriptionOrder(
    {
      user: { id: String(userId) },
      headers: {},
      body: {
        farmId: String(farmId),
        planId: String(planId),
        billingCycle: "monthly",
        displayCurrency: "USD",
        freeTrial: true,
        ...body,
      },
    },
    res,
  );
  return res;
}

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
});
afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

describe("free trial rules", () => {
  test("constants match the offer", () => {
    expect(FREE_TRIAL_DAYS).toBe(21);
    expect(FREE_TRIAL_MAX_HECTARES).toBe(5);
    expect(FREE_TRIAL_MAX_ACRES).toBeCloseTo(5 / HA, 6);
    expect(freeTrialOffer({ brand: "cropgen", platform: "web", slug: "pro-plan" })).toMatchObject({
      days: 21, maxHectares: 5, maxFarms: 1, requiresAutopay: true, currency: "USD",
    });
    expect(freeTrialOffer({ brand: "cropgen", platform: "all", slug: "base-plan-mobile" })).toMatchObject({
      days: 21, currency: "INR",
    });
  });

  test("only the CropGen web Growth plan carries the offer", () => {
    expect(isFreeTrialPlan({ brand: "cropgen", platform: "web", slug: "pro-plan" })).toBe(true);
    expect(isFreeTrialPlan({ brand: "cropgen", platform: "web", slug: "basic-plan" })).toBe(false);
    expect(isFreeTrialPlan({ brand: "aat", platform: "web", slug: "pro-plan" })).toBe(false);
    expect(isFreeTrialPlan({ brand: "cropgen", platform: "all", slug: "pro-plan" })).toBe(false);
    // India: the Basic plan (platform "all")
    expect(isFreeTrialPlan({ brand: "cropgen", platform: "all", slug: "base-plan-mobile" })).toBe(true);
    expect(isFreeTrialPlan({ brand: "cropgen", platform: "web", slug: "base-plan-mobile" })).toBe(false);
    expect(isFreeTrialPlan({ brand: "biodrops", platform: "all", slug: "base-plan-mobile" })).toBe(false);
  });
});

describe("POST create-order with freeTrial", () => {
  test("starts a 21-day trial with autopay on the Growth plan", async () => {
    const userId = oid();
    const planId = await seedPlan();
    const farmId = await seedFarm(userId, 3);

    const res = await order({ userId, farmId, planId });
    expect(res.statusCode).toBe(201);
    expect(res.body.type).toBe("trial_with_mandate");
    expect(res.body.daysLeft).toBe(21);
    expect(rz.createPostTrialRazorpaySubscription).toHaveBeenCalled();

    const days = Math.round((new Date(res.body.endDate) - new Date(res.body.startDate)) / 86400000);
    expect(days).toBe(21);

    const row = await UserSubscription.findById(res.body.subscriptionId).lean();
    expect(row.freeTrialOffer).toBe(true);
    expect(row.billingCycle).toBe("trial");
    expect(row.commitBillingCycle).toBe("monthly");
    expect(String(row.postTrialPlanId)).toBe(String(planId));
    expect(row.subscriptionPhase).toBe("trial_mandate_pending");
  });

  test("farm over 5 ha is rejected", async () => {
    const userId = oid();
    const growth = await SubscriptionPlan.findOne({ slug: "pro-plan" }).lean();
    const farmId = await seedFarm(userId, 5.5);
    const res = await order({ userId, farmId, planId: growth._id });
    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe("FREE_TRIAL_AREA_LIMIT");
  });

  test("exactly 5 ha is allowed", async () => {
    const userId = oid();
    const growth = await SubscriptionPlan.findOne({ slug: "pro-plan" }).lean();
    const farmId = await seedFarm(userId, 5);
    const res = await order({ userId, farmId, planId: growth._id });
    expect(res.statusCode).toBe(201);
  });

  test("not the Growth plan / INR / yearly+trial cycle are rejected", async () => {
    const userId = oid();
    const farmId = await seedFarm(userId, 2);
    const starter = await seedPlan({ slug: "basic-plan", name: "Starter Plan" });
    const growth = await SubscriptionPlan.findOne({ slug: "pro-plan" }).lean();

    expect((await order({ userId, farmId, planId: starter })).body.code).toBe("FREE_TRIAL_PLAN");
    const inr = await order({ userId, farmId, planId: growth._id, body: { displayCurrency: "INR" } });
    expect(inr.statusCode).toBe(400);
    expect(inr.body.code).toBe("FREE_TRIAL_REGION");
    expect((await order({ userId, farmId, planId: growth._id, body: { billingCycle: "trial" } })).statusCode).toBe(400);
  });

  test("once per account: a started trial blocks a second one, an abandoned one does not", async () => {
    const userId = oid();
    const growth = await SubscriptionPlan.findOne({ slug: "pro-plan" }).lean();
    const farmA = await seedFarm(userId, 2);
    const farmB = await seedFarm(userId, 2);

    const first = await order({ userId, farmId: farmA, planId: growth._id });
    expect(first.statusCode).toBe(201);

    // still "mandate pending" (checkout abandoned): retry is allowed
    expect(await userHasUsedFreeTrial(userId)).toBe(false);
    expect((await order({ userId, farmId: farmB, planId: growth._id })).statusCode).toBe(201);

    // autopay saved -> trial is really running
    await UserSubscription.updateMany(
      { userId, freeTrialOffer: true },
      { $set: { status: "cancelled" } },
    );
    await UserSubscription.updateOne(
      { _id: first.body.subscriptionId },
      { $set: { status: "active", subscriptionPhase: "trial_mandate_saved" } },
    );
    expect(await userHasUsedFreeTrial(userId)).toBe(true);
    const second = await order({ userId, farmId: farmB, planId: growth._id });
    expect(second.statusCode).toBe(409);
    expect(second.body.code).toBe("FREE_TRIAL_USED");
  });

  test("a trial that cannot be set up with autopay is not granted for free", async () => {
    const userId = oid();
    // A Growth-like plan with no USD pricing: there is nothing to put on autopay.
    const bare = await seedPlan({ slug: "growth-no-price", pricing: [] });
    process.env.FREE_TRIAL_PLAN_SLUG = "growth-no-price";
    try {
      const farmId = await seedFarm(userId, 2);
      const res = await order({ userId, farmId, planId: bare });
      expect(res.statusCode).toBe(400);
      expect(await UserSubscription.countDocuments({ userId })).toBe(0);
    } finally {
      delete process.env.FREE_TRIAL_PLAN_SLUG;
    }
  });
});

describe("free trial for India (INR, Basic plan)", () => {
  const inrPricing = [
    { currency: "INR", billingCycle: "monthly", pricePerUnitMinor: 19900, unit: "acre" },
    { currency: "INR", billingCycle: "yearly", pricePerUnitMinor: 99900, unit: "acre" },
  ];
  const seedBasic = () =>
    seedPlan({
      name: "Basic plan",
      slug: "base-plan-mobile",
      platform: "all",
      isTrialEnabled: true,
      trialDays: 7,
      pricing: inrPricing,
    });

  test("starts a 21-day trial (not the Basic plan's 7 days) with autopay in INR", async () => {
    const userId = oid();
    const basic = await seedBasic();
    const farmId = await seedFarm(userId, 4);

    const res = await order({ userId, farmId, planId: basic, body: { displayCurrency: "INR" } });
    expect(res.statusCode).toBe(201);
    expect(res.body.type).toBe("trial_with_mandate");
    expect(res.body.daysLeft).toBe(21);

    const row = await UserSubscription.findById(res.body.subscriptionId).lean();
    expect(row.freeTrialOffer).toBe(true);
    expect(row.billingCycle).toBe("trial");
    expect(String(row.postTrialPlanId)).toBe(String(basic));
    expect(row.displayCurrency).toBe("INR");
  });

  test("the 5 ha limit applies in India too", async () => {
    const userId = oid();
    const basic = await SubscriptionPlan.findOne({ slug: "base-plan-mobile" }).lean();
    const farmId = await seedFarm(userId, 5.01);
    const res = await order({ userId, farmId, planId: basic._id, body: { displayCurrency: "INR" } });
    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe("FREE_TRIAL_AREA_LIMIT");
  });

  test("currency must match the plan's offer (USD on Basic, INR on Growth)", async () => {
    const userId = oid();
    const basic = await SubscriptionPlan.findOne({ slug: "base-plan-mobile" }).lean();
    const growth = await SubscriptionPlan.findOne({ slug: "pro-plan" }).lean();
    const farmId = await seedFarm(userId, 2);
    const usdOnBasic = await order({ userId, farmId, planId: basic._id, body: { displayCurrency: "USD" } });
    expect(usdOnBasic.body.code).toBe("FREE_TRIAL_REGION");
    const inrOnGrowth = await order({ userId, farmId, planId: growth._id, body: { displayCurrency: "INR" } });
    expect(inrOnGrowth.body.code).toBe("FREE_TRIAL_REGION");
  });

  test("the mobile app can start the INR Basic trial but not the USD Growth one", async () => {
    const basic = await SubscriptionPlan.findOne({ slug: "base-plan-mobile" }).lean();
    const growth = await SubscriptionPlan.findOne({ slug: "pro-plan" }).lean();
    const mobileOrder = async (userId, farmId, planId, displayCurrency) => {
      const res = mockRes();
      await createSubscriptionOrder(
        {
          user: { id: String(userId) },
          headers: { "x-client-app": "cropgen_android" },
          body: {
            farmId: String(farmId), planId: String(planId), billingCycle: "monthly",
            displayCurrency, freeTrial: true,
          },
        },
        res,
      );
      return res;
    };

    const userId = oid();
    const farmId = await seedFarm(userId, 3);
    const ok = await mobileOrder(userId, farmId, basic._id, "INR");
    expect(ok.statusCode).toBe(201);
    expect(ok.body.daysLeft).toBe(21);

    const other = oid();
    const farm2 = await seedFarm(other, 3);
    const blocked = await mobileOrder(other, farm2, growth._id, "USD");
    expect(blocked.statusCode).toBe(403); // web-only plan, refused by the mobile restriction
  });

  test("one trial per account across both currencies", async () => {
    const userId = oid();
    const basic = await SubscriptionPlan.findOne({ slug: "base-plan-mobile" }).lean();
    const growth = await SubscriptionPlan.findOne({ slug: "pro-plan" }).lean();
    const farmA = await seedFarm(userId, 2);
    const farmB = await seedFarm(userId, 2);

    const first = await order({ userId, farmId: farmA, planId: basic._id, body: { displayCurrency: "INR" } });
    expect(first.statusCode).toBe(201);
    await UserSubscription.updateOne(
      { _id: first.body.subscriptionId },
      { $set: { status: "active", subscriptionPhase: "trial_mandate_saved" } },
    );
    const second = await order({ userId, farmId: farmB, planId: growth._id });
    expect(second.statusCode).toBe(409);
    expect(second.body.code).toBe("FREE_TRIAL_USED");
  });
});

describe("live trial detection (drives the 1-farm / no-extra-area limits)", () => {
  test("only an active, unconverted, unexpired free trial counts", async () => {
    const userId = oid();
    const base = {
      _id: oid(), userId, fieldId: oid(), planId: oid(), platform: "web", area: 4,
      unit: "acre", pricePerUnitMinor: 0, totalAmountMinor: 0, freeTrialOffer: true,
      billingCycle: "trial", status: "active", startDate: new Date(),
      endDate: new Date(Date.now() + 5 * 86400000),
    };
    await UserSubscription.collection.insertOne(base);
    expect(await getLiveFreeTrial(userId)).toBeTruthy();

    await UserSubscription.collection.updateOne({ _id: base._id }, { $set: { endDate: new Date(Date.now() - 1000) } });
    expect(await getLiveFreeTrial(userId)).toBeNull(); // expired

    await UserSubscription.collection.updateOne(
      { _id: base._id },
      { $set: { endDate: new Date(Date.now() + 86400000), billingCycle: "monthly" } },
    );
    expect(await getLiveFreeTrial(userId)).toBeNull(); // converted to paid
  });
});

describe("admin subscribers list: Free Trial filter", () => {
  test("freeTrial=true / false splits free-trial rows from the rest", async () => {
    const userId = oid();
    await mongoose.connection.db.collection("users").insertOne({ _id: userId, firstName: "A", lastName: "B", email: "a@b.test" });
    const base = (extra) => ({
      _id: oid(), userId, fieldId: oid(), planId: oid(), platform: "web", area: 1, unit: "acre",
      pricePerUnitMinor: 0, totalAmountMinor: 0, billingCycle: "trial", status: "active",
      startDate: new Date(), endDate: new Date(Date.now() + 86400000), createdAt: new Date(), ...extra,
    });
    const trial = base({ freeTrialOffer: true });
    const paid = base({ freeTrialOffer: false });
    const legacy = base({}); // rows created before the field existed
    await UserSubscription.collection.insertMany([trial, paid, legacy]);

    const list = async (freeTrial) => {
      const res = mockRes();
      await getUserSubscriptions({ query: { freeTrial, limit: "100" }, user: { role: "admin" } }, res);
      expect(res.statusCode).toBe(200);
      return res.body.data.filter((d) => String(d.userId) === String(userId)).map((d) => String(d._id));
    };

    expect(await list("true")).toEqual([String(trial._id)]);
    expect((await list("false")).sort()).toEqual([String(paid._id), String(legacy._id)].sort());
    expect((await list("")).length).toBe(3);
  });
});

describe("1-farm limit only applies to trial-only accounts", () => {
  const row = (userId, extra) => ({
    _id: oid(), userId, fieldId: oid(), planId: oid(), platform: "web", area: 2, unit: "acre",
    pricePerUnitMinor: 0, totalAmountMinor: 0, status: "active", startDate: new Date(),
    endDate: new Date(Date.now() + 10 * 86400000), ...extra,
  });
  const liveTrial = (userId) =>
    row(userId, { freeTrialOffer: true, billingCycle: "trial" });

  test("trial only: adding a farm is blocked", async () => {
    const userId = oid();
    await UserSubscription.collection.insertOne(liveTrial(userId));
    expect(await userHasPaidSubscription(userId)).toBe(false);
    expect(await freeTrialBlocksNewFarm(userId)).toBe(true);
  });

  test("a paid farm lifts the limit while the trial runs", async () => {
    for (const cycle of ["monthly", "yearly", "season"]) {
      const userId = oid();
      await UserSubscription.collection.insertMany([
        liveTrial(userId),
        row(userId, { billingCycle: cycle, freeTrialOffer: false }),
      ]);
      expect(await userHasPaidSubscription(userId)).toBe(true);
      expect(await freeTrialBlocksNewFarm(userId)).toBe(false);
    }
  });

  test("an expired, cancelled or pending paid row does not lift it", async () => {
    const userId = oid();
    await UserSubscription.collection.insertMany([
      liveTrial(userId),
      row(userId, { billingCycle: "monthly", endDate: new Date(Date.now() - 1000) }),
      row(userId, { billingCycle: "yearly", status: "cancelled" }),
      row(userId, { billingCycle: "yearly", status: "pending" }),
      row(userId, { billingCycle: "trial", freeTrialOffer: false }), // old 7-day trial is not paid
    ]);
    expect(await userHasPaidSubscription(userId)).toBe(false);
    expect(await freeTrialBlocksNewFarm(userId)).toBe(true);
  });

  test("no live free trial: never blocked", async () => {
    const userId = oid();
    expect(await freeTrialBlocksNewFarm(userId)).toBe(false);
  });
});
