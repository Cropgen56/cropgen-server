/**
 * End-to-end subscription flows through the real controllers:
 * create-order -> verify-order -> webhooks -> farm list -> admin actions.
 * In-memory MongoDB; only Razorpay network calls are mocked.
 */
import { jest } from "@jest/globals";
import crypto from "crypto";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";

jest.setTimeout(180000);

process.env.RAZORPAY_KEY_ID = "rzp_test_unit";
process.env.RAZORPAY_KEY_SECRET = "test_secret_value";
process.env.RAZORPAY_WEBHOOK_SECRET = "whsec_unit";
const SECRET = process.env.RAZORPAY_KEY_SECRET;

const cancelled = [];
const refunds = [];
let failRefund = false;
let subCounter = 0;
const real = await import("../services/razorpay.subscription.service.js");
jest.unstable_mockModule("../services/razorpay.subscription.service.js", () => ({
  ...real,
  getRazorpay: () => ({}),
  razorpayClientsFor: () => [
    {
      tag: "default",
      payments: {
        refund: async (paymentId, body) => {
          if (failRefund) throw { statusCode: 400, error: { description: "refund rejected by razorpay" } };
          refunds.push([paymentId, body]);
          return { id: `rfnd_${paymentId}`, amount: 19900, currency: "INR", status: "processed" };
        },
      },
    },
  ],
  ensureRazorpayCustomer: async () => ({ customerId: "cust_x" }),
  createRazorpayPlan: async () => ({ id: `plan_${++subCounter}` }),
  createRazorpaySubscription: async () => ({ id: `sub_${++subCounter}` }),
  createPostTrialRazorpaySubscription: async ({ commitBillingCycle }) => ({
    rzPlan: { id: `plan_${++subCounter}` },
    rzSub: { id: `sub_${++subCounter}` },
    billingPattern: real.billingPatternFromBillingCycle
      ? real.billingPatternFromBillingCycle(commitBillingCycle)
      : commitBillingCycle === "yearly" ? "yearly" : commitBillingCycle === "season" ? "season" : "twelve_monthly",
  }),
  cancelRazorpaySubscriptionBestEffort: async (_c, id) => {
    if (id) cancelled.push(id);
  },
}));

const { default: SubscriptionPlan } = await import("../models/subscription-plan.model.js");
const { default: UserSubscription } = await import("../models/user-subscription.model.js");
const { default: FarmField } = await import("../models/field.model.js");
const { default: User } = await import("../models/user.model.js");
const { default: SubscriptionBillingEvent } = await import("../models/subscription-billing-event.model.js");
const { planSwitchRefundDecision, PLAN_SWITCH_REFUND_WINDOW_MS } = await import("../utils/subscription/refundPolicy.js");
const { createSubscriptionOrder } = await import("../controllers/subscription/create.subscription.order.controller.js");
const { verifySubscriptionOrder } = await import("../controllers/subscription/verify.subscription.order.controller.js");
const { handleRazorpayWebhook } = await import("../controllers/subscription/razorpay.webhook.controller.js");
const { activateSubscriptionManually } = await import("../controllers/subscription/activate.subscription.controller.js");
const { cancelSubscriptionAdmin } = await import("../controllers/subscription/admin.user.subscription.controller.js");
const { deleteUserSubscription, updateUserSubscription } = await import("../controllers/subscription/user.subscription.controller.js");
const { getField } = await import("../controllers/field/field.controller.js");

let mongo;
const oid = () => new mongoose.Types.ObjectId();
const HA = 0.404686;

const mockRes = () => {
  const res = { statusCode: 200 };
  res.status = (c) => ((res.statusCode = c), res);
  res.json = (b) => ((res.body = b), res);
  res.send = (b) => ((res.body = b), res);
  return res;
};
const sign = (payload) => crypto.createHmac("sha256", SECRET).update(payload).digest("hex");

const usdPricing = [
  { currency: "USD", billingCycle: "monthly", pricePerUnitMinor: 149, unit: "hectare" },
  { currency: "USD", billingCycle: "yearly", pricePerUnitMinor: 1490, unit: "hectare" },
];
const inrPricing = [
  { currency: "INR", billingCycle: "monthly", pricePerUnitMinor: 19900, unit: "acre" },
  { currency: "INR", billingCycle: "yearly", pricePerUnitMinor: 99900, unit: "acre" },
];

async function seedPlan(o = {}) {
  const _id = oid();
  await SubscriptionPlan.collection.insertOne({
    _id, name: "Plan", slug: `p-${_id}`, brand: "cropgen", platform: "web", active: true,
    pricing: usdPricing, features: {}, isTrialEnabled: false, ...o,
  });
  return _id;
}
async function seedUser() {
  const _id = oid();
  await User.collection.insertOne({ _id, firstName: "T", lastName: "U", email: `${_id}@t.test`, role: "farmer" });
  return _id;
}
async function seedFarm(userId, acres = 3) {
  const _id = oid();
  await FarmField.collection.insertOne({ _id, user: userId, acre: acres, fieldName: "Farm", field: [] });
  return _id;
}
const order = async (userId, body, headers = {}) => {
  const res = mockRes();
  await createSubscriptionOrder({ user: { id: String(userId) }, headers, body }, res);
  return res;
};
const verify = async (userId, body, role = "farmer") => {
  const res = mockRes();
  await verifySubscriptionOrder({ user: { id: String(userId), role }, body }, res);
  return res;
};
const webhook = async (event, { secret = process.env.RAZORPAY_WEBHOOK_SECRET, id } = {}) => {
  const raw = Buffer.from(JSON.stringify(event));
  const res = mockRes();
  await handleRazorpayWebhook(
    {
      body: raw,
      headers: {
        "x-razorpay-signature": crypto.createHmac("sha256", secret).update(raw).digest("hex"),
        "x-razorpay-event-id": id || `evt_${++subCounter}`,
      },
    },
    res,
  );
  return res;
};
const rowOf = (id) => UserSubscription.collection.findOne({ _id: new mongoose.Types.ObjectId(String(id)) });

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
});
afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});
beforeEach(() => {
  cancelled.length = 0;
  refunds.length = 0;
  failRefund = false;
});

describe("web checkout: trial with autopay -> verify -> conversion", () => {
  test("monthly checkout creates a 7-day trial with a mandate; verify activates it", async () => {
    const userId = await seedUser();
    const planId = await seedPlan({ slug: "growth-x" });
    const farmId = await seedFarm(userId, 2);

    const created = await order(userId, { farmId: String(farmId), planId: String(planId), billingCycle: "monthly", displayCurrency: "USD" });
    expect(created.statusCode).toBe(201);
    expect(created.body.type).toBe("trial_with_mandate");
    expect(created.body.daysLeft).toBe(7);

    const row = await rowOf(created.body.subscriptionId);
    expect(row.status).toBe("pending");
    expect(row.subscriptionPhase).toBe("trial_mandate_pending");

    const payId = "pay_1";
    const rzSub = row.razorpaySubscriptionId;
    const ok = await verify(userId, {
      subscriptionId: String(row._id), razorpay_payment_id: payId,
      razorpay_subscription_id: rzSub, razorpay_signature: sign(`${payId}|${rzSub}`),
    });
    expect(ok.statusCode).toBe(200);
    const after = await rowOf(row._id);
    expect(after.status).toBe("active");
    expect(after.subscriptionPhase).toBe("trial_mandate_saved");
  });

  test("bad signature is refused and nothing is activated", async () => {
    const userId = await seedUser();
    const planId = await seedPlan({ slug: "growth-y" });
    const farmId = await seedFarm(userId, 2);
    const created = await order(userId, { farmId: String(farmId), planId: String(planId), billingCycle: "monthly", displayCurrency: "USD" });
    const row = await rowOf(created.body.subscriptionId);
    const res = await verify(userId, {
      subscriptionId: String(row._id), razorpay_payment_id: "pay_2",
      razorpay_subscription_id: row.razorpaySubscriptionId, razorpay_signature: "deadbeef",
    });
    expect(res.statusCode).toBe(400);
    expect((await rowOf(row._id)).status).toBe("pending");
  });

  test("trial mandate: a payment for another Razorpay subscription is refused", async () => {
    const userId = await seedUser();
    const planId = await seedPlan({ slug: "growth-z" });
    const farmId = await seedFarm(userId, 2);
    const created = await order(userId, { farmId: String(farmId), planId: String(planId), billingCycle: "monthly", displayCurrency: "USD" });
    const row = await rowOf(created.body.subscriptionId);
    const res = await verify(userId, {
      subscriptionId: String(row._id), razorpay_payment_id: "pay_3",
      razorpay_subscription_id: "sub_somebody_else", razorpay_signature: sign("pay_3|sub_somebody_else"),
    });
    expect(res.statusCode).toBe(400);
    expect((await rowOf(row._id)).status).toBe("pending");
  });

  test("webhook: authenticated saves the mandate, charged converts the trial to the paid plan", async () => {
    const userId = await seedUser();
    const planId = await seedPlan({ slug: "growth-w" });
    const farmId = await seedFarm(userId, 2);
    const created = await order(userId, { farmId: String(farmId), planId: String(planId), billingCycle: "yearly", displayCurrency: "USD" });
    const row = await rowOf(created.body.subscriptionId);
    const subEntity = { id: row.razorpaySubscriptionId, notes: { userSubscriptionId: String(row._id) } };

    expect((await webhook({ event: "subscription.authenticated", payload: { subscription: { entity: subEntity } } })).statusCode).toBe(200);
    let r = await rowOf(row._id);
    expect(r.status).toBe("active");
    expect(r.subscriptionPhase).toBe("trial_mandate_saved");
    expect(r.billingCycle).toBe("trial");

    await webhook({ event: "subscription.charged", payload: { subscription: { entity: subEntity }, invoice: { entity: { payment_id: "pay_c", subscription_id: subEntity.id } } } });
    r = await rowOf(row._id);
    expect(r.billingCycle).toBe("yearly");
    expect(r.subscriptionPhase).toBe("active_paid");
    expect(r.status).toBe("active");
    expect(String(r.planId)).toBe(String(planId));
    expect(new Date(r.endDate).getTime()).toBeGreaterThan(Date.now() + 300 * 86400000);
  });

  test("webhook: duplicate event ids are processed once; a forged signature is refused", async () => {
    const userId = await seedUser();
    const planId = await seedPlan({ slug: "growth-d" });
    const farmId = await seedFarm(userId, 2);
    const created = await order(userId, { farmId: String(farmId), planId: String(planId), billingCycle: "monthly", displayCurrency: "USD" });
    const row = await rowOf(created.body.subscriptionId);
    const ev = { event: "subscription.authenticated", payload: { subscription: { entity: { id: row.razorpaySubscriptionId, notes: { userSubscriptionId: String(row._id) } } } } };
    await webhook(ev, { id: "evt_dup" });
    await UserSubscription.collection.updateOne({ _id: row._id }, { $set: { status: "pending", subscriptionPhase: "trial_mandate_pending" } });
    await webhook(ev, { id: "evt_dup" }); // same id: ignored
    expect((await rowOf(row._id)).status).toBe("pending");

    const forged = await webhook(ev, { secret: "wrong", id: "evt_forged" });
    expect(forged.statusCode).toBe(400);
  });

  test("webhook: a processing failure answers 500 and Razorpay's retry of the same event applies it", async () => {
    const userId = await seedUser();
    const planId = await seedPlan({ slug: "growth-retry" });
    const farmId = await seedFarm(userId, 2);
    const created = await order(userId, { farmId: String(farmId), planId: String(planId), billingCycle: "yearly", displayCurrency: "USD" });
    const row = await rowOf(created.body.subscriptionId);
    const ev = { event: "subscription.authenticated", payload: { subscription: { entity: { id: row.razorpaySubscriptionId, notes: { userSubscriptionId: String(row._id) } } } } };

    const saveSpy = jest
      .spyOn(UserSubscription.prototype, "save")
      .mockRejectedValueOnce(new Error("db blip"));
    const errSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    try {
      const first = await webhook(ev, { id: "evt_retry" });
      expect(first.statusCode).toBe(500); // not acknowledged → Razorpay retries
      expect((await rowOf(row._id)).status).toBe("pending");
      expect(await SubscriptionBillingEvent.countDocuments({ razorpayEventId: "evt_retry" })).toBe(0);

      const retry = await webhook(ev, { id: "evt_retry" });
      expect(retry.statusCode).toBe(200);
      expect((await rowOf(row._id)).status).toBe("active");
      expect(await SubscriptionBillingEvent.countDocuments({ razorpayEventId: "evt_retry" })).toBe(1);
    } finally {
      saveSpy.mockRestore();
      errSpy.mockRestore();
    }
  });

  test("webhook: unparseable body with a valid signature is refused with 400", async () => {
    const raw = Buffer.from("not json");
    const res = mockRes();
    await handleRazorpayWebhook(
      {
        body: raw,
        headers: {
          "x-razorpay-signature": crypto.createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET).update(raw).digest("hex"),
          "x-razorpay-event-id": "evt_badjson",
        },
      },
      res,
    );
    expect(res.statusCode).toBe(400);
  });
});

describe("paid (non-trial) recurring checkout: payment must belong to the subscription", () => {
  // A plan without a trial (platform "all", trial off) produces a pending paid subscription.
  const makePending = async () => {
    const userId = await seedUser();
    const planId = await seedPlan({ slug: `paid-${oid()}`, platform: "all", pricing: inrPricing });
    const farmId = await seedFarm(userId, 4);
    const created = await order(userId, { farmId: String(farmId), planId: String(planId), billingCycle: "monthly", displayCurrency: "INR" });
    expect(created.statusCode).toBe(201);
    expect(created.body.type).toBe("subscription");
    const row = await rowOf(created.body.subscriptionId);
    return { userId, farmId, row };
  };

  test("the genuine payment activates it", async () => {
    const { userId, row } = await makePending();
    const res = await verify(userId, {
      subscriptionId: String(row._id), razorpay_payment_id: "pay_ok",
      razorpay_subscription_id: row.razorpaySubscriptionId, razorpay_signature: sign(`pay_ok|${row.razorpaySubscriptionId}`),
    });
    expect(res.statusCode).toBe(200);
    expect((await rowOf(row._id)).status).toBe("active");
  });

  test("SECURITY: a valid signature for a different (cheaper) Razorpay subscription must not activate it", async () => {
    const { userId, row } = await makePending();
    const res = await verify(userId, {
      subscriptionId: String(row._id), razorpay_payment_id: "pay_cheap",
      razorpay_subscription_id: "sub_my_cheap_one", razorpay_signature: sign("pay_cheap|sub_my_cheap_one"),
    });
    expect(res.statusCode).toBe(400);
    expect((await rowOf(row._id)).status).toBe("pending");
  });

  test("SECURITY: another user cannot verify (activate) someone else's subscription", async () => {
    const { row } = await makePending();
    const stranger = await seedUser();
    const res = await verify(stranger, {
      subscriptionId: String(row._id), razorpay_payment_id: "pay_ok2",
      razorpay_subscription_id: row.razorpaySubscriptionId, razorpay_signature: sign(`pay_ok2|${row.razorpaySubscriptionId}`),
    });
    expect([403, 404]).toContain(res.statusCode);
    expect((await rowOf(row._id)).status).toBe("pending");
  });

  test("an admin may verify on a customer's behalf", async () => {
    const { row } = await makePending();
    const admin = await seedUser();
    const res = await verify(admin, {
      subscriptionId: String(row._id), razorpay_payment_id: "pay_ok3",
      razorpay_subscription_id: row.razorpaySubscriptionId, razorpay_signature: sign(`pay_ok3|${row.razorpaySubscriptionId}`),
    }, "admin");
    expect(res.statusCode).toBe(200);
  });

  test("activating retires the farm's old plan AND cancels its autopay (plan change)", async () => {
    const userId = await seedUser();
    const planA = await seedPlan({ slug: `a-${oid()}`, platform: "all", pricing: inrPricing });
    const planB = await seedPlan({ slug: `b-${oid()}`, platform: "all", pricing: inrPricing });
    const farmId = await seedFarm(userId, 4);
    const mk = async (planId) => {
      const c = await order(userId, { farmId: String(farmId), planId: String(planId), billingCycle: "monthly", displayCurrency: "INR" });
      const row = await rowOf(c.body.subscriptionId);
      await verify(userId, { subscriptionId: String(row._id), razorpay_payment_id: `pay_${row._id}`, razorpay_subscription_id: row.razorpaySubscriptionId, razorpay_signature: sign(`pay_${row._id}|${row.razorpaySubscriptionId}`) });
      return row;
    };
    const a = await mk(planA);
    cancelled.length = 0;
    const b = await mk(planB);
    expect((await rowOf(a._id)).status).toBe("expired");
    expect((await rowOf(b._id)).status).toBe("active");
    expect(cancelled).toContain(a.razorpaySubscriptionId);
    expect(cancelled).not.toContain(b.razorpaySubscriptionId);
  });
});

describe("admin actions", () => {
  test("manual activation retires the old plan and cancels its autopay", async () => {
    const userId = await seedUser();
    const farmId = await seedFarm(userId, 3);
    const oldPlan = await seedPlan({ slug: `old-${oid()}` });
    const newPlan = await seedPlan({ slug: `new-${oid()}` });
    const old = {
      _id: oid(), userId, fieldId: farmId, planId: oldPlan, platform: "web", area: 3, unit: "acre",
      pricePerUnitMinor: 100, totalAmountMinor: 300, billingCycle: "monthly", status: "active",
      startDate: new Date(), endDate: new Date(Date.now() + 20 * 86400000), razorpaySubscriptionId: "sub_old_admin",
    };
    await UserSubscription.collection.insertOne(old);

    const res = mockRes();
    await activateSubscriptionManually(
      { user: { id: String(oid()), role: "admin" }, body: { userId: String(userId), farmId: String(farmId), planId: String(newPlan), billingCycle: "yearly" } },
      res,
    );
    expect(res.statusCode).toBe(201);
    expect((await rowOf(old._id)).status).toBe("expired");
    expect(cancelled).toContain("sub_old_admin");
    const fresh = await rowOf(res.body.subscriptionId);
    expect(fresh.status).toBe("active");
    expect(fresh.activatedByAdmin).toBe(true);
  });

  test("admin cancel stops the Razorpay autopay and marks the row cancelled; a second cancel is refused", async () => {
    const userId = await seedUser();
    const farmId = await seedFarm(userId, 3);
    const planId = await seedPlan({ slug: `c-${oid()}` });
    const row = {
      _id: oid(), userId, fieldId: farmId, planId, platform: "web", area: 3, unit: "acre",
      pricePerUnitMinor: 100, totalAmountMinor: 300, billingCycle: "monthly", status: "active",
      startDate: new Date(), endDate: new Date(Date.now() + 20 * 86400000), razorpaySubscriptionId: "sub_to_cancel",
    };
    await UserSubscription.collection.insertOne(row);
    const res = mockRes();
    await cancelSubscriptionAdmin({ params: { id: String(row._id) }, user: { id: String(oid()), role: "admin" } }, res);
    expect(res.statusCode).toBe(200);
    expect(cancelled).toContain("sub_to_cancel");
    expect((await rowOf(row._id)).status).toBe("cancelled");
    const again = mockRes();
    await cancelSubscriptionAdmin({ params: { id: String(row._id) }, user: { id: String(oid()), role: "admin" } }, again);
    expect(again.statusCode).toBe(400);
  });
});

describe("farm list: what each farm shows", () => {
  const listFor = async (userId) => {
    const res = mockRes();
    await getField({ params: { userId: String(userId) }, user: { id: String(userId), role: "farmer" } }, res);
    return res;
  };

  test("no plan -> locked; active paid -> unlocked with plan; expired -> locked; free trial exposes its flag", async () => {
    const userId = await seedUser();
    const planId = await seedPlan({ slug: `lp-${oid()}`, name: "Growth Plan", features: { weatherAnalytics: true } });
    const none = await seedFarm(userId, 2);
    const paid = await seedFarm(userId, 2);
    const expired = await seedFarm(userId, 2);
    const trial = await seedFarm(userId, 2);
    const base = (fieldId, extra) => ({
      _id: oid(), userId, fieldId, planId, platform: "web", area: 2, unit: "acre",
      pricePerUnitMinor: 100, totalAmountMinor: 200, status: "active", startDate: new Date(),
      endDate: new Date(Date.now() + 10 * 86400000), ...extra,
    });
    await UserSubscription.collection.insertMany([
      base(paid, { billingCycle: "monthly" }),
      base(expired, { billingCycle: "monthly", endDate: new Date(Date.now() - 86400000) }),
      base(trial, { billingCycle: "trial", freeTrialOffer: true, commitBillingCycle: "yearly" }),
    ]);

    const res = await listFor(userId);
    expect(res.statusCode).toBe(200);
    const by = Object.fromEntries(res.body.farmFields.map((f) => [String(f._id), f]));

    expect(by[String(none)].isLocked).toBe(true);
    expect(by[String(none)].subscription.hasActiveSubscription).toBe(false);

    expect(by[String(paid)].isLocked).toBe(false);
    expect(by[String(paid)].subscription.plan.name).toBe("Growth Plan");
    expect(by[String(paid)].subscription.plan.features.weatherAnalytics).toBe(true);

    expect(by[String(expired)].isLocked).toBe(true);
    expect(by[String(expired)].subscription.hasActiveSubscription).toBe(false);

    const t = by[String(trial)].subscription;
    expect(t.billingCycle).toBe("trial");
    expect(t.freeTrialOffer).toBe(true);
    expect(t.commitBillingCycle).toBe("yearly");
    expect(by[String(trial)].isLocked).toBe(false);
  });

  test("trialEligible: a fresh farm can trial; a farm with a plan or a used trial cannot", async () => {
    const userId = await seedUser();
    const planId = await seedPlan({ slug: `te-${oid()}` });
    const fresh = await seedFarm(userId, 2);
    const withPlan = await seedFarm(userId, 2);
    const usedTrial = await seedFarm(userId, 2);
    const convertedLapsed = await seedFarm(userId, 2);
    const abandoned = await seedFarm(userId, 2);
    const row = (fieldId, extra) => ({
      _id: oid(), userId, fieldId, planId, platform: "web", area: 2, unit: "acre", pricePerUnitMinor: 100,
      totalAmountMinor: 200, startDate: new Date(), endDate: new Date(Date.now() + 10 * 86400000), ...extra,
    });
    await UserSubscription.collection.insertMany([
      row(withPlan, { billingCycle: "monthly", status: "active" }),
      row(usedTrial, { billingCycle: "trial", status: "expired", postTrialPlanId: planId, subscriptionPhase: "trial_mandate_saved", endDate: new Date(Date.now() - 86400000) }),
      row(convertedLapsed, { billingCycle: "yearly", status: "expired", postTrialPlanId: planId, subscriptionPhase: "active_paid", endDate: new Date(Date.now() - 86400000) }),
      row(abandoned, { billingCycle: "trial", status: "cancelled", postTrialPlanId: planId, subscriptionPhase: "trial_mandate_pending" }),
    ]);
    const res = await listFor(userId);
    const by = Object.fromEntries(res.body.farmFields.map((f) => [String(f._id), f.trialEligible]));
    expect(by[String(fresh)]).toBe(true);
    expect(by[String(withPlan)]).toBe(false);
    expect(by[String(usedTrial)]).toBe(false);
    expect(by[String(convertedLapsed)]).toBe(false);
    expect(by[String(abandoned)]).toBe(true);
  });

  test("a farm grown beyond its covered area is locked until re-subscribed", async () => {
    const userId = await seedUser();
    const planId = await seedPlan({ slug: `lg-${oid()}` });
    const farm = await seedFarm(userId, 5); // grew to 5 acres
    await UserSubscription.collection.insertOne({
      _id: oid(), userId, fieldId: farm, planId, platform: "web", area: 2, unit: "acre", // paid for 2
      pricePerUnitMinor: 100, totalAmountMinor: 200, billingCycle: "monthly", status: "active",
      startDate: new Date(), endDate: new Date(Date.now() + 10 * 86400000),
    });
    const res = await listFor(userId);
    expect(res.body.farmFields[0].isLocked).toBe(true);
  });
});

describe("bad input is a 4xx, never a 500", () => {
  test("create-order: malformed / unknown ids and missing fields", async () => {
    const userId = await seedUser();
    const planId = await seedPlan({ slug: `e-${oid()}` });
    const farmId = await seedFarm(userId, 2);
    const base = { billingCycle: "monthly", displayCurrency: "USD" };

    const badFarm = await order(userId, { ...base, farmId: "not-an-id", planId: String(planId) });
    expect(badFarm.statusCode).toBe(400);
    const badPlan = await order(userId, { ...base, farmId: String(farmId), planId: "not-an-id" });
    expect(badPlan.statusCode).toBe(400);
    expect((await order(userId, { ...base, farmId: String(oid()), planId: String(planId) })).statusCode).toBe(404);
    expect((await order(userId, { ...base, farmId: String(farmId), planId: String(oid()) })).statusCode).toBe(404);
    expect((await order(userId, { ...base })).statusCode).toBe(400); // nothing supplied
    // another user's farm
    const other = await seedUser();
    expect((await order(other, { ...base, farmId: String(farmId), planId: String(planId) })).statusCode).toBe(404);
  });

  test("create-order: an unsupported billing cycle is rejected", async () => {
    const userId = await seedUser();
    const planId = await seedPlan({ slug: `e2-${oid()}`, platform: "all", pricing: inrPricing });
    const farmId = await seedFarm(userId, 2);
    const res = await order(userId, { farmId: String(farmId), planId: String(planId), billingCycle: "weekly", displayCurrency: "INR" });
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
    expect(res.statusCode).toBeLessThan(500);
  });

  test("verify-order: malformed subscription id and missing fields", async () => {
    const userId = await seedUser();
    expect((await verify(userId, { subscriptionId: "nope", razorpay_payment_id: "p", razorpay_subscription_id: "s", razorpay_signature: "x" })).statusCode).toBe(400);
    expect((await verify(userId, { subscriptionId: String(oid()), razorpay_payment_id: "p", razorpay_subscription_id: "s", razorpay_signature: "x" })).statusCode).toBe(404);
    expect((await verify(userId, {})).statusCode).toBe(400);
  });

  test("verify-order: activating twice is refused", async () => {
    const userId = await seedUser();
    const planId = await seedPlan({ slug: `e3-${oid()}`, platform: "all", pricing: inrPricing });
    const farmId = await seedFarm(userId, 2);
    const c = await order(userId, { farmId: String(farmId), planId: String(planId), billingCycle: "monthly", displayCurrency: "INR" });
    const row = await rowOf(c.body.subscriptionId);
    const body = { subscriptionId: String(row._id), razorpay_payment_id: "pay_twice", razorpay_subscription_id: row.razorpaySubscriptionId, razorpay_signature: sign(`pay_twice|${row.razorpaySubscriptionId}`) };
    expect((await verify(userId, body)).statusCode).toBe(200);
    expect((await verify(userId, body)).statusCode).toBe(400);
  });
});

describe("admin delete / update of a subscription", () => {
  const mkRow = async (extra = {}) => {
    const userId = await seedUser();
    const farmId = await seedFarm(userId, 3);
    const planId = await seedPlan({ slug: `x-${oid()}` });
    const row = {
      _id: oid(), userId, fieldId: farmId, planId, platform: "web", area: 3, unit: "acre",
      pricePerUnitMinor: 100, totalAmountMinor: 300, billingCycle: "monthly", status: "active",
      startDate: new Date(), endDate: new Date(Date.now() + 20 * 86400000), ...extra,
    };
    await UserSubscription.collection.insertOne(row);
    return row;
  };
  const admin = () => ({ id: String(oid()), role: "admin" });

  test("delete cancels the live Razorpay autopay before removing the record", async () => {
    const row = await mkRow({ razorpaySubscriptionId: "sub_del" });
    const res = mockRes();
    await deleteUserSubscription({ params: { id: String(row._id) }, user: admin() }, res);
    expect(res.statusCode).toBe(200);
    expect(cancelled).toContain("sub_del");
    expect(await rowOf(row._id)).toBeNull();
  });

  test("delete of an already cancelled/expired row does not call Razorpay; malformed / unknown ids are 4xx", async () => {
    const row = await mkRow({ razorpaySubscriptionId: "sub_done", status: "expired" });
    const res = mockRes();
    await deleteUserSubscription({ params: { id: String(row._id) }, user: admin() }, res);
    expect(res.statusCode).toBe(200);
    expect(cancelled).not.toContain("sub_done");

    const bad = mockRes();
    await deleteUserSubscription({ params: { id: "nope" }, user: admin() }, bad);
    expect(bad.statusCode).toBe(400);
    const missing = mockRes();
    await deleteUserSubscription({ params: { id: String(oid()) }, user: admin() }, missing);
    expect(missing.statusCode).toBe(404);
  });

  test("update cannot move a subscription to another user/farm; invalid values are a 400", async () => {
    const row = await mkRow();
    const thief = oid(), elsewhere = oid();
    const res = mockRes();
    await updateUserSubscription({ params: { id: String(row._id) }, user: admin(), body: { userId: String(thief), fieldId: String(elsewhere), status: "cancelled" } }, res);
    expect(res.statusCode).toBe(200);
    const after = await rowOf(row._id);
    expect(String(after.userId)).toBe(String(row.userId));
    expect(String(after.fieldId)).toBe(String(row.fieldId));
    expect(after.status).toBe("cancelled");

    const bad = mockRes();
    await updateUserSubscription({ params: { id: String(row._id) }, user: admin(), body: { status: "not-a-status" } }, bad);
    expect(bad.statusCode).toBe(400);
  });
});

describe("one trial per farm, and switching plans is never a new trial", () => {
  const webOrder = (userId, farmId, planId, cycle = "monthly", extra = {}) =>
    order(userId, { farmId: String(farmId), planId: String(planId), billingCycle: cycle, displayCurrency: "USD", ...extra });
  const activate = async (userId, res) => {
    const row = await rowOf(res.body.subscriptionId);
    const pay = `pay_${row._id}`;
    const v = await verify(userId, { subscriptionId: String(row._id), razorpay_payment_id: pay, razorpay_subscription_id: row.razorpaySubscriptionId, razorpay_signature: sign(`${pay}|${row.razorpaySubscriptionId}`) });
    expect(v.statusCode).toBe(200);
    return row;
  };

  test("first web checkout on a farm is a trial; once that trial has run, the next checkout is a paid subscription", async () => {
    const userId = await seedUser();
    const plan = await seedPlan({ slug: `t1-${oid()}` });
    const farm = await seedFarm(userId, 2);

    const first = await webOrder(userId, farm, plan);
    expect(first.body.type).toBe("trial_with_mandate");
    await activate(userId, first);
    // the trial ends without converting (card declined / cancelled): the row expires
    await UserSubscription.collection.updateOne({ _id: new mongoose.Types.ObjectId(String(first.body.subscriptionId)) }, { $set: { status: "expired" } });

    const again = await webOrder(userId, farm, plan);
    expect(again.statusCode).toBe(201);
    expect(again.body.type).toBe("subscription"); // no second trial
    const row = await rowOf(again.body.subscriptionId);
    expect(row.billingCycle).toBe("monthly");
    expect(row.status).toBe("pending");
  });

  test("web asking for billingCycle 'trial' on a used farm is billed on the chosen cycle, not as a trial", async () => {
    const userId = await seedUser();
    const plan = await seedPlan({ slug: `t2-${oid()}` });
    const farm = await seedFarm(userId, 2);
    const first = await webOrder(userId, farm, plan);
    await activate(userId, first);
    await UserSubscription.collection.updateOne({ _id: new mongoose.Types.ObjectId(String(first.body.subscriptionId)) }, { $set: { status: "expired" } });

    const res = await order(userId, { farmId: String(farm), planId: String(plan), billingCycle: "trial", commitBillingCycle: "yearly", displayCurrency: "USD" });
    expect(res.body.type).toBe("subscription");
    expect((await rowOf(res.body.subscriptionId)).billingCycle).toBe("yearly");
    const bad = await order(userId, { farmId: String(farm), planId: String(plan), billingCycle: "trial", commitBillingCycle: "weekly", displayCurrency: "USD" });
    expect(bad.statusCode).toBe(400);
  });

  test("a trial that converted to paid and later lapsed still counts as the farm's trial", async () => {
    const userId = await seedUser();
    const plan = await seedPlan({ slug: `t3-${oid()}` });
    const farm = await seedFarm(userId, 2);
    const first = await webOrder(userId, farm, plan, "yearly");
    const row = await activate(userId, first);
    const sub = { id: row.razorpaySubscriptionId, notes: { userSubscriptionId: String(row._id) } };
    await webhook({ event: "subscription.charged", payload: { subscription: { entity: sub }, invoice: { entity: { payment_id: "pay_conv", subscription_id: sub.id } } } });
    expect((await rowOf(row._id)).billingCycle).toBe("yearly"); // converted: no longer billingCycle "trial"
    await UserSubscription.collection.updateOne({ _id: row._id }, { $set: { status: "expired" } });

    const again = await webOrder(userId, farm, plan);
    expect(again.body.type).toBe("subscription");
  });

  test("an abandoned trial checkout does not use up the farm's trial", async () => {
    const userId = await seedUser();
    const plan = await seedPlan({ slug: `t4-${oid()}` });
    const farm = await seedFarm(userId, 2);
    expect((await webOrder(userId, farm, plan)).body.type).toBe("trial_with_mandate"); // never verified
    expect((await webOrder(userId, farm, plan)).body.type).toBe("trial_with_mandate");
  });

  test("switching plans on a farm that has a running plan is an immediate paid checkout (no new trial)", async () => {
    const userId = await seedUser();
    const planA = await seedPlan({ slug: `sa-${oid()}` });
    const planB = await seedPlan({ slug: `sb-${oid()}` });
    const farm = await seedFarm(userId, 2);
    // farm already on a paid plan that never had a trial (e.g. admin-activated)
    await UserSubscription.collection.insertOne({
      _id: oid(), userId, fieldId: farm, planId: planA, platform: "web", area: 2, unit: "acre",
      pricePerUnitMinor: 0, totalAmountMinor: 0, billingCycle: "yearly", status: "active",
      startDate: new Date(), endDate: new Date(Date.now() + 100 * 86400000), activationSource: "admin",
    });
    const sw = await webOrder(userId, farm, planB, "monthly");
    expect(sw.body.type).toBe("subscription");
    expect(sw.body.razorpay.subscription_id).toBeTruthy();
    const row = await rowOf(sw.body.subscriptionId);
    expect(row.billingCycle).toBe("monthly");
    expect(row.freeTrialOffer).not.toBe(true);
  });

  test("upgrading during a running trial skips a second trial and, once paid, retires the trial's autopay", async () => {
    const userId = await seedUser();
    const planA = await seedPlan({ slug: `ua-${oid()}` });
    const planB = await seedPlan({ slug: `ub-${oid()}` });
    const farm = await seedFarm(userId, 2);
    const trial = await webOrder(userId, farm, planA);
    const trialRow = await activate(userId, trial);
    expect((await rowOf(trialRow._id)).status).toBe("active");

    cancelled.length = 0;
    const up = await webOrder(userId, farm, planB, "yearly");
    expect(up.body.type).toBe("subscription");
    const paidRow = await rowOf(up.body.subscriptionId);
    await activate(userId, up);
    expect((await rowOf(trialRow._id)).status).toBe("expired");
    expect((await rowOf(paidRow._id)).status).toBe("active");
    expect(cancelled).toContain(trialRow.razorpaySubscriptionId);
  });

  test("the 21-day free trial is refused for a farm that already has a plan or used a trial", async () => {
    const userId = await seedUser();
    // the offer plan is identified by slug: use a dedicated slug through the env override
    const offerPlan = await seedPlan({ slug: `offer-${oid()}` });
    process.env.FREE_TRIAL_PLAN_SLUG = (await SubscriptionPlan.collection.findOne({ _id: offerPlan })).slug;
    try {
      const withPlan = await seedFarm(userId, 2);
      await UserSubscription.collection.insertOne({
        _id: oid(), userId, fieldId: withPlan, planId: offerPlan, platform: "web", area: 2, unit: "acre",
        pricePerUnitMinor: 0, totalAmountMinor: 0, billingCycle: "monthly", status: "active",
        startDate: new Date(), endDate: new Date(Date.now() + 10 * 86400000),
      });
      const r1 = await webOrder(userId, withPlan, offerPlan, "monthly", { freeTrial: true });
      expect(r1.statusCode).toBe(409);
      expect(r1.body.code).toBe("FREE_TRIAL_FARM_USED");

      const fresh = await seedFarm(userId, 2);
      const ok = await webOrder(userId, fresh, offerPlan, "monthly", { freeTrial: true });
      expect(ok.statusCode).toBe(201);
      expect(ok.body.daysLeft).toBe(21);
    } finally {
      delete process.env.FREE_TRIAL_PLAN_SLUG;
    }
  });

  test("an old one-time order without its stored order id cannot be verified", async () => {
    const userId = await seedUser();
    const planId = await seedPlan({ slug: `lg-${oid()}` });
    const farm = await seedFarm(userId, 2);
    const row = {
      _id: oid(), userId, fieldId: farm, planId, platform: "web", area: 2, unit: "acre",
      pricePerUnitMinor: 100, totalAmountMinor: 200, billingCycle: "monthly", status: "pending",
      billingMode: "legacy_order", startDate: new Date(), endDate: new Date(Date.now() + 86400000),
    };
    await UserSubscription.collection.insertOne(row);
    const res = await verify(userId, { subscriptionId: String(row._id), razorpay_payment_id: "pay_l", razorpay_order_id: "order_any", razorpay_signature: sign("order_any|pay_l") });
    expect(res.statusCode).toBe(400);
    expect((await rowOf(row._id)).status).toBe("pending");

    // with the stored order id and a matching signature it still verifies
    await UserSubscription.collection.updateOne({ _id: row._id }, { $set: { razorpayOrderId: "order_real" } });
    const ok = await verify(userId, { subscriptionId: String(row._id), razorpay_payment_id: "pay_l2", razorpay_order_id: "order_real", razorpay_signature: sign("order_real|pay_l2") });
    expect(ok.statusCode).toBe(200);
  });
});

describe("plan switch: refund only when switched within 24 hours", () => {
  const HOUR = 3600 * 1000;
  /** A paid plan on a farm (immediate paid checkout, genuine payment verified). */
  async function paidPlan(userId, farmId, ageHours) {
    const planId = await seedPlan({ slug: `rf-${oid()}`, platform: "all", pricing: inrPricing });
    const c = await order(userId, { farmId: String(farmId), planId: String(planId), billingCycle: "monthly", displayCurrency: "INR" });
    const row = await rowOf(c.body.subscriptionId);
    const pay = `pay_${row._id}`;
    const v = await verify(userId, { subscriptionId: String(row._id), razorpay_payment_id: pay, razorpay_subscription_id: row.razorpaySubscriptionId, razorpay_signature: sign(`${pay}|${row.razorpaySubscriptionId}`) });
    expect(v.statusCode).toBe(200);
    await UserSubscription.collection.updateOne({ _id: row._id }, { $set: { startDate: new Date(Date.now() - ageHours * HOUR) } });
    return { row, pay };
  }
  async function switchTo(userId, farmId) {
    const planId = await seedPlan({ slug: `rf2-${oid()}`, platform: "all", pricing: inrPricing });
    const c = await order(userId, { farmId: String(farmId), planId: String(planId), billingCycle: "monthly", displayCurrency: "INR" });
    expect(c.body.type).toBe("subscription");
    const row = await rowOf(c.body.subscriptionId);
    const pay = `pay_${row._id}`;
    return verify(userId, { subscriptionId: String(row._id), razorpay_payment_id: pay, razorpay_subscription_id: row.razorpaySubscriptionId, razorpay_signature: sign(`${pay}|${row.razorpaySubscriptionId}`) });
  }

  test("policy: refund window is exactly 24 hours of the old payment", () => {
    const base = { status: "active", billingCycle: "monthly", razorpayPaymentId: "pay_x", startDate: new Date(), activationSource: "razorpay" };
    const at = (ms) => planSwitchRefundDecision(base, new Date(base.startDate.getTime() + ms));
    expect(PLAN_SWITCH_REFUND_WINDOW_MS).toBe(24 * HOUR);
    expect(at(0).eligible).toBe(true);
    expect(at(23 * HOUR + 59 * 60000).eligible).toBe(true);
    expect(at(24 * HOUR).eligible).toBe(true);
    expect(at(24 * HOUR + 1000)).toEqual({ eligible: false, reason: "outside_24h_window" });
    expect(at(-1000).eligible).toBe(false); // start date in the future: never
  });

  test("policy: only genuine customer payments qualify", () => {
    const ok = { status: "active", billingCycle: "yearly", razorpayPaymentId: "pay_x", startDate: new Date() };
    expect(planSwitchRefundDecision(ok).eligible).toBe(true);
    expect(planSwitchRefundDecision({ ...ok, billingCycle: "trial" }).reason).toBe("not_a_paid_plan");
    expect(planSwitchRefundDecision({ ...ok, activatedByAdmin: true }).reason).toBe("not_a_customer_payment");
    expect(planSwitchRefundDecision({ ...ok, activationSource: "demo_key" }).reason).toBe("not_a_customer_payment");
    expect(planSwitchRefundDecision({ ...ok, razorpayPaymentId: null }).reason).toBe("no_payment_on_record");
    expect(planSwitchRefundDecision({ ...ok, status: "expired" }).reason).toBe("not_active");
    expect(planSwitchRefundDecision(null).eligible).toBe(false);
  });

  test("switching within 24 hours refunds the old plan's payment in full, and the new plan is charged in full", async () => {
    const userId = await seedUser();
    const farm = await seedFarm(userId, 4);
    const old = await paidPlan(userId, farm, 2); // paid 2 hours ago
    const res = await switchTo(userId, farm);

    expect(res.statusCode).toBe(200);
    expect(res.body.data.previousPlanRefund).toMatchObject({ status: "refunded", paymentId: old.pay, refundId: `rfnd_${old.pay}`, amountMinor: 19900 });
    expect(refunds).toHaveLength(1);
    expect(refunds[0][0]).toBe(old.pay);
    expect(refunds[0][1].amount).toBeUndefined(); // full refund
    expect(refunds[0][1].notes.reason).toBe("plan_switch_within_24h");

    const ev = await SubscriptionBillingEvent.findOne({ razorpayEventId: `plan_switch_refund:${old.row._id}` }).lean();
    expect(ev.eventType).toBe("refund.plan_switch");
    expect(ev.razorpayPaymentId).toBe(old.pay);

    expect((await rowOf(old.row._id)).status).toBe("expired");
    expect(cancelled).toContain(old.row.razorpaySubscriptionId); // autopay stopped too
    const fresh = await UserSubscription.findOne({ fieldId: farm, status: "active" }).lean();
    expect(fresh.totalAmountMinor).toBe(4 * 19900); // no credit: full price for the new plan
  });

  test("switching after 24 hours refunds nothing (and still retires the old plan and its autopay)", async () => {
    const userId = await seedUser();
    const farm = await seedFarm(userId, 4);
    const old = await paidPlan(userId, farm, 25);
    const res = await switchTo(userId, farm);

    expect(res.statusCode).toBe(200);
    expect(res.body.data.previousPlanRefund).toBeNull();
    expect(refunds).toHaveLength(0);
    expect(await SubscriptionBillingEvent.countDocuments({ razorpayEventId: new RegExp(`^plan_switch_refund`), userSubscriptionId: old.row._id })).toBe(0);
    expect((await rowOf(old.row._id)).status).toBe("expired");
    expect(cancelled).toContain(old.row.razorpaySubscriptionId);
  });

  test("an admin-activated or trial plan has no payment to refund, even inside 24 hours", async () => {
    const userId = await seedUser();
    const farm = await seedFarm(userId, 4);
    const planA = await seedPlan({ slug: `adm-${oid()}` });
    await UserSubscription.collection.insertOne({
      _id: oid(), userId, fieldId: farm, planId: planA, platform: "web", area: 4, unit: "acre",
      pricePerUnitMinor: 0, totalAmountMinor: 0, billingCycle: "yearly", status: "active",
      startDate: new Date(), endDate: new Date(Date.now() + 300 * 86400000),
      activationSource: "admin", activatedByAdmin: true, razorpayPaymentId: "pay_should_not_refund",
    });
    const res = await switchTo(userId, farm);
    expect(res.statusCode).toBe(200);
    expect(res.body.data.previousPlanRefund).toBeNull();
    expect(refunds).toHaveLength(0);
  });

  test("a refund failure never blocks the new plan; it is recorded for an admin to finish", async () => {
    const userId = await seedUser();
    const farm = await seedFarm(userId, 4);
    const old = await paidPlan(userId, farm, 1);
    failRefund = true;
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});
    const res = await switchTo(userId, farm);
    spy.mockRestore();

    expect(res.statusCode).toBe(200); // new plan activated
    expect(res.body.data.previousPlanRefund.status).toBe("failed");
    expect(await UserSubscription.countDocuments({ fieldId: farm, status: "active" })).toBe(1);
    const failed = await SubscriptionBillingEvent.findOne({ userSubscriptionId: old.row._id, eventType: "refund.plan_switch.failed" }).lean();
    expect(failed.payloadSummary.error).toContain("refund rejected");
  });

  test("never refunds the same old plan twice", async () => {
    const userId = await seedUser();
    const farm = await seedFarm(userId, 4);
    const old = await paidPlan(userId, farm, 1);
    await SubscriptionBillingEvent.create({
      userSubscriptionId: old.row._id, userId, fieldId: farm, razorpayEventId: `plan_switch_refund:${old.row._id}`,
      eventType: "refund.plan_switch", razorpayPaymentId: old.pay,
    });
    const res = await switchTo(userId, farm);
    expect(res.statusCode).toBe(200);
    expect(res.body.data.previousPlanRefund).toBeNull();
    expect(refunds).toHaveLength(0);
  });

  test("the first plan on a farm has nothing to refund", async () => {
    const userId = await seedUser();
    const farm = await seedFarm(userId, 4);
    const res = await switchTo(userId, farm);
    expect(res.statusCode).toBe(200);
    expect(res.body.data.previousPlanRefund).toBeNull();
    expect(refunds).toHaveLength(0);
  });
});
