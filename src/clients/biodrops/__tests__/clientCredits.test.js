/**
 * BioDrops client hectare credits: admin plans, client purchase, and farms
 * unlocked from the client's pool. Runs against an in-memory MongoDB and a
 * mocked Razorpay — never the database or payment account in .env.
 */
import { jest } from "@jest/globals";
import express from "express";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import request from "supertest";
import { MongoMemoryServer } from "mongodb-memory-server";

jest.setTimeout(120000);

process.env.JWT_ACCESS_SECRET = "test-access-secret";
process.env.JWT_REFRESH_SECRET = "test-refresh-secret";
process.env.AWS_REGION_CROPGEN = "us-east-1";
process.env.AWS_ACCESS_KEY_ID_CROPGEN = "test";
process.env.AWS_SECRET_ACCESS_KEY_CROPGEN = "test";

let orderSeq = 0;
jest.unstable_mockModule("../../../services/razorpay.order.service.js", () => ({
  createRazorpayProductOrder: jest.fn(async ({ amountMinor, currency }) => ({
    id: `order_test_${++orderSeq}`,
    amount: amountMinor,
    currency,
  })),
  verifyRazorpayPaymentSignature: ({ razorpaySignature }) =>
    razorpaySignature === "valid-sig",
  getRazorpayKeyId: () => "rzp_test_key",
  refundRazorpayPayment: jest.fn(),
}));
// Activation push notifications are irrelevant here.
jest.unstable_mockModule("../../../services/notification.service.js", () => ({
  createSubscriptionActivationNotification: jest.fn(async () => {}),
  createSubscriptionExpiryNotification: jest.fn(async () => {}),
  createWelcomeFarmNotification: jest.fn(async () => {}),
}));

let mongo;
let app;
let User;
let Organization;
let FarmField;
let SubscriptionPlan;
let UserSubscription;
let Purchase;
let credits;

const ids = {};

function tokenFor(user) {
  return jwt.sign(
    { id: String(user._id), role: user.role, organization: String(user.organization) },
    process.env.JWT_ACCESS_SECRET,
    { expiresIn: "1h" },
  );
}
const asUser = (user) => ({ Authorization: `Bearer ${tokenFor(user)}` });

async function createField(user, acre) {
  // Raw insert: skips the model's post-save advisory hooks.
  const { insertedId } = await FarmField.collection.insertOne({
    user: user._id,
    fieldName: `Field ${acre}ac`,
    acre,
    field: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  return FarmField.findById(insertedId).lean();
}

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  process.env.MONGO_URI = mongo.getUri();
  await mongoose.connect(mongo.getUri());

  ({ default: User } = await import("../../../models/user.model.js"));
  ({ default: Organization } = await import("../../../models/organization.model.js"));
  ({ default: FarmField } = await import("../../../models/field.model.js"));
  ({ default: SubscriptionPlan } = await import("../../../models/subscription-plan.model.js"));
  ({ default: UserSubscription } = await import("../../../models/user-subscription.model.js"));
  ({ default: Purchase } = await import("../models/biodrops-client-credit-purchase.model.js"));
  credits = await import("../services/clientCredits.service.js");
  const { default: biodropsRoutes } = await import("../routes/index.js");
  const { default: farmerCreditRoutes } = await import("../routes/client-credits.routes.js");

  app = express();
  app.use(express.json());
  app.use("/v1/api/auth", biodropsRoutes);
  app.use("/v1/api/biodrops/client-credits", farmerCreditRoutes);

  const biodrops = await Organization.create({
    organizationName: "BioDrops",
    organizationCode: "BIODROPS",
  });
  ids.client = await Organization.create({
    organizationName: "Green Valley FPO",
    organizationCode: "BD-GREEN1",
    parentOrganization: biodrops._id,
    status: "active",
  });
  ids.otherClient = await Organization.create({
    organizationName: "Other FPO",
    organizationCode: "BD-OTHER1",
    parentOrganization: biodrops._id,
    status: "active",
  });

  ids.admin = await User.create({
    email: "admin@example.test",
    role: "admin",
    terms: true,
    organization: biodrops._id,
  });
  ids.clientViewer = await User.create({
    email: "client@example.test",
    role: "staff",
    terms: true,
    organization: biodrops._id,
    clientOrganization: ids.client._id,
  });
  ids.otherViewer = await User.create({
    email: "other@example.test",
    role: "staff",
    terms: true,
    organization: biodrops._id,
    clientOrganization: ids.otherClient._id,
  });
  const farmer = (n, clientOrganization) =>
    User.create({
      firstName: `Farmer${n}`,
      phone: `+9198765432${n}0`,
      role: "farmer",
      terms: true,
      organization: biodrops._id,
      clientOrganization,
      country: "IN",
      state: "MH",
      district: "Pune",
    });
  ids.clientFarmer = await farmer(1, ids.client._id);
  ids.loneFarmer = await farmer(2, null);

  ids.featurePlan = await SubscriptionPlan.create({
    name: "BioDrops Pro",
    slug: "biodrops-pro-test",
    brand: "biodrops",
    platform: "all",
    features: { satelliteImagery: true },
  });
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});

describe("admin plans", () => {
  test("super admin creates a 10 ha plan at ₹50/ha", async () => {
    const res = await request(app)
      .post("/v1/api/auth/crm/client-credit-plans")
      .set(asUser(ids.admin))
      .send({
        name: "Starter 10 ha",
        totalHectares: 10,
        pricePerHectareMinor: 5000,
        validityMonths: 12,
        featurePlanId: String(ids.featurePlan._id),
      });
    expect(res.status).toBe(201);
    expect(res.body.plan.totalPriceMinor).toBe(50000);
    expect(res.body.plan.featurePlan.name).toBe("BioDrops Pro");
    ids.plan = res.body.plan;
  });

  test("a plan made for one client is hidden from other clients", async () => {
    const res = await request(app)
      .post("/v1/api/auth/crm/client-credit-plans")
      .set(asUser(ids.admin))
      .send({
        name: "Other only",
        totalHectares: 5,
        pricePerHectareMinor: 100,
        validityMonths: 6,
        featurePlanId: String(ids.featurePlan._id),
        clientId: String(ids.otherClient._id),
      });
    expect(res.status).toBe(201);

    const mine = await request(app)
      .get("/v1/api/auth/crm/client-credits/me/plans")
      .set(asUser(ids.clientViewer));
    expect(mine.body.plans.map((p) => p.name)).toEqual(["Starter 10 ha"]);

    const theirs = await request(app)
      .get("/v1/api/auth/crm/client-credits/me/plans")
      .set(asUser(ids.otherViewer));
    expect(theirs.body.plans.map((p) => p.name).sort()).toEqual(["Other only", "Starter 10 ha"]);
  });

  test("client viewers cannot manage plans; admins cannot use client routes", async () => {
    const asClient = await request(app)
      .post("/v1/api/auth/crm/client-credit-plans")
      .set(asUser(ids.clientViewer))
      .send({ name: "x" });
    expect(asClient.status).toBe(403);

    const asAdmin = await request(app)
      .get("/v1/api/auth/crm/client-credits/me")
      .set(asUser(ids.admin));
    expect(asAdmin.status).toBe(403);
  });
});

describe("client purchase", () => {
  test("purchase opens a Razorpay order and is paid after signature verify", async () => {
    process.env.CLIENT_CREDITS_RAZORPAY = "true";
    const start = await request(app)
      .post("/v1/api/auth/crm/client-credits/me/purchases")
      .set(asUser(ids.clientViewer))
      .send({ planId: ids.plan.id });
    expect(start.status).toBe(201);
    expect(start.body.razorpayOrder.amount).toBe(50000);
    expect(start.body.razorpayKeyId).toBe("rzp_test_key");
    const purchaseId = start.body.purchase.id;

    const bad = await request(app)
      .post(`/v1/api/auth/crm/client-credits/me/purchases/${purchaseId}/verify`)
      .set(asUser(ids.clientViewer))
      .send({
        razorpay_order_id: start.body.razorpayOrder.id,
        razorpay_payment_id: "pay_1",
        razorpay_signature: "forged",
      });
    expect(bad.status).toBe(400);

    // Another client cannot verify this client's purchase.
    const foreign = await request(app)
      .post(`/v1/api/auth/crm/client-credits/me/purchases/${purchaseId}/verify`)
      .set(asUser(ids.otherViewer))
      .send({
        razorpay_order_id: start.body.razorpayOrder.id,
        razorpay_payment_id: "pay_1",
        razorpay_signature: "valid-sig",
      });
    expect(foreign.status).toBe(404);

    const ok = await request(app)
      .post(`/v1/api/auth/crm/client-credits/me/purchases/${purchaseId}/verify`)
      .set(asUser(ids.clientViewer))
      .send({
        razorpay_order_id: start.body.razorpayOrder.id,
        razorpay_payment_id: "pay_1",
        razorpay_signature: "valid-sig",
      });
    expect(ok.status).toBe(200);
    expect(ok.body.purchase.status).toBe("active");
    expect(ok.body.purchase.remainingCredits).toBe(10);

    // A late webhook for the same order is a no-op.
    const purchase = await Purchase.findById(purchaseId);
    const again = await credits.markClientCreditPurchasePaid({ purchase });
    expect(again.alreadyPaid).toBe(true);
    ids.purchaseId = purchaseId;
    delete process.env.CLIENT_CREDITS_RAZORPAY;
  });

  test("balance shows the 10 credits", async () => {
    const res = await request(app)
      .get("/v1/api/auth/crm/client-credits/me")
      .set(asUser(ids.clientViewer));
    expect(res.status).toBe(200);
    expect(res.body.summary).toMatchObject({
      totalCredits: 10,
      usedCredits: 0,
      remainingCredits: 10,
      hasActivePlan: true,
    });
  });
});

describe("farmer add-farm preview", () => {
  test("a client farmer sees the credits a farm will use", async () => {
    const res = await request(app)
      .get("/v1/api/biodrops/client-credits/preview?acres=5")
      .set(asUser(ids.clientFarmer));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      eligible: true,
      clientName: "Green Valley FPO",
      creditsNeeded: 2.02,
      remainingCredits: 10,
      remainingAfter: 7.98,
      enoughCredits: true,
    });

    const big = await request(app)
      .get("/v1/api/biodrops/client-credits/preview?acres=30")
      .set(asUser(ids.clientFarmer));
    expect(big.body.enoughCredits).toBe(false);
  });

  test("a farmer without a client gets no confirmation", async () => {
    const res = await request(app)
      .get("/v1/api/biodrops/client-credits/preview?acres=5")
      .set(asUser(ids.loneFarmer));
    expect(res.status).toBe(200);
    expect(res.body.eligible).toBe(false);
  });
});

describe("farm activation from credits", () => {
  test("a client farmer's 5 acre farm is unlocked for 2.02 credits", async () => {
    const field = await createField(ids.clientFarmer, 5);
    const result = await credits.applyClientCreditsToNewField({
      field,
      owner: ids.clientFarmer,
    });
    expect(result).toMatchObject({ applied: true, creditsUsed: 2.02 });

    const sub = await UserSubscription.findOne({ fieldId: field._id }).lean();
    expect(sub).toMatchObject({
      status: "active",
      activationSource: "client_credits",
      area: 5,
      totalAmountMinor: 0,
    });
    const pool = await Purchase.findById(ids.purchaseId).lean();
    expect(pool.usedCredits).toBeCloseTo(2.02);
    expect(sub.endDate.getTime()).toBe(pool.validUntil.getTime());
    ids.field = field;
  });

  test("a farmer outside any client keeps the normal paywall", async () => {
    const field = await createField(ids.loneFarmer, 2);
    const result = await credits.applyClientCreditsToNewField({
      field,
      owner: ids.loneFarmer,
    });
    expect(result.applied).toBe(false);
    expect(await UserSubscription.exists({ fieldId: field._id })).toBeNull();
  });

  test("a farm larger than the remaining credits takes nothing", async () => {
    const field = await createField(ids.clientFarmer, 30); // 12.14 ha
    const result = await credits.applyClientCreditsToNewField({
      field,
      owner: ids.clientFarmer,
    });
    expect(result).toMatchObject({ applied: false, reason: "insufficient_credits" });
    const pool = await Purchase.findById(ids.purchaseId).lean();
    expect(pool.usedCredits).toBeCloseTo(2.02);
  });

  test("growing a farm charges only the extra hectares", async () => {
    await FarmField.updateOne({ _id: ids.field._id }, { $set: { acre: 10 } });
    const field = await FarmField.findById(ids.field._id).lean();
    const result = await credits.applyClientCreditsToAreaIncrease({ field });
    expect(result).toMatchObject({ applied: true, creditsUsed: 2.03 });
    const sub = await UserSubscription.findOne({ fieldId: field._id }).lean();
    expect(sub.area).toBe(10);
  });

  test("concurrent farm adds never overdraw the pool", async () => {
    // 5.95 credits left; each 2 acre farm costs 0.81 → at most 7 fit.
    const fields = await Promise.all(
      Array.from({ length: 10 }, () => createField(ids.clientFarmer, 2)),
    );
    const results = await Promise.all(
      fields.map((field) =>
        credits.applyClientCreditsToNewField({ field, owner: ids.clientFarmer }),
      ),
    );
    expect(results.filter((r) => r.applied)).toHaveLength(7);
    const pool = await Purchase.findById(ids.purchaseId).lean();
    expect(pool.usedCredits).toBeLessThanOrEqual(10);
    expect(pool.usedCredits).toBeCloseTo(4.05 + 7 * 0.81);
  });
});

describe("usage reporting", () => {
  test("client sees the ledger and per-farmer totals", async () => {
    const usage = await request(app)
      .get("/v1/api/auth/crm/client-credits/me/usage?limit=5")
      .set(asUser(ids.clientViewer));
    expect(usage.status).toBe(200);
    expect(usage.body.pagination.total).toBe(9); // 1 + area increase + 7
    expect(usage.body.transactions).toHaveLength(5);

    const me = await request(app)
      .get("/v1/api/auth/crm/client-credits/me")
      .set(asUser(ids.clientViewer));
    expect(me.body.byFarmer).toHaveLength(1);
    expect(me.body.byFarmer[0]).toMatchObject({ name: "Farmer1", farms: 8 });
    expect(me.body.summary.farmsActivated).toBe(8);
  });

  test("admin overview shows each client's remaining credits", async () => {
    const res = await request(app)
      .get("/v1/api/auth/crm/client-credits/overview")
      .set(asUser(ids.admin));
    expect(res.status).toBe(200);
    const green = res.body.clients.find((c) => c.id === String(ids.client._id));
    expect(green.credits.totalCredits).toBe(10);
    expect(green.credits.remainingCredits).toBeCloseTo(0.28);
    expect(res.body.recentPurchases).toHaveLength(1);

    const detail = await request(app)
      .get(`/v1/api/auth/crm/client-credits/clients/${ids.client._id}`)
      .set(asUser(ids.admin));
    expect(detail.status).toBe(200);
    expect(detail.body.byFarmer[0].farms).toBe(8);
  });

  test("with Razorpay off (default), buying activates the plan immediately", async () => {
    const plans = await request(app)
      .get("/v1/api/auth/crm/client-credits/me/plans")
      .set(asUser(ids.otherViewer));
    const plan = plans.body.plans.find((p) => p.name === "Other only");

    const res = await request(app)
      .post("/v1/api/auth/crm/client-credits/me/purchases")
      .set(asUser(ids.otherViewer))
      .send({ planId: plan.id });
    expect(res.status).toBe(201);
    expect(res.body.razorpayOrder).toBeNull();
    expect(res.body.purchase.status).toBe("active");

    const me = await request(app)
      .get("/v1/api/auth/crm/client-credits/me")
      .set(asUser(ids.otherViewer));
    expect(me.body.summary.remainingCredits).toBe(5);
    const stored = await Purchase.findById(res.body.purchase.id).lean();
    expect(stored.paymentMethod).toBe("direct");
  });

  test("deactivating hides a plan from clients; activating shows it again", async () => {
    const myPlans = () =>
      request(app)
        .get("/v1/api/auth/crm/client-credits/me/plans")
        .set(asUser(ids.clientViewer));
    const setActive = (active) =>
      request(app)
        .patch(`/v1/api/auth/crm/client-credit-plans/${ids.plan.id}`)
        .set(asUser(ids.admin))
        .send({ active });

    const off = await setActive(false);
    expect(off.status).toBe(200);
    expect(off.body.plan.active).toBe(false);
    expect((await myPlans()).body.plans).toHaveLength(0);

    const on = await setActive(true);
    expect(on.body.plan.active).toBe(true);
    expect((await myPlans()).body.plans).toHaveLength(1);
  });

  test("deleting a bought plan removes it but the client keeps their credits", async () => {
    const res = await request(app)
      .delete(`/v1/api/auth/crm/client-credit-plans/${ids.plan.id}`)
      .set(asUser(ids.admin));
    expect(res.status).toBe(200);
    expect(res.body.deleted).toBe(true);

    const plans = await request(app)
      .get("/v1/api/auth/crm/client-credits/me/plans")
      .set(asUser(ids.clientViewer));
    expect(plans.body.plans).toHaveLength(0);

    const me = await request(app)
      .get("/v1/api/auth/crm/client-credits/me")
      .set(asUser(ids.clientViewer));
    expect(me.body.summary.totalCredits).toBe(10);
    expect(me.body.purchases[0].planName).toBe("Starter 10 ha");
  });
});
