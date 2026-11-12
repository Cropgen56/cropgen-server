/**
 * Server-side plan-feature enforcement for farm operations.
 * Runs against an in-memory MongoDB, never the database in .env.
 */
import { jest } from "@jest/globals";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import SubscriptionPlan from "../models/subscription-plan.model.js";
import UserSubscription from "../models/user-subscription.model.js";
import Operation from "../models/operation.model.js";
import FarmField from "../models/field.model.js";
import {
  fieldLacksPlanFeature,
  requirePlanFeature,
  requireOperationPlanFeature,
  requireBodyFieldPlanFeature,
} from "../middleware/planFeature.middleware.js";

jest.setTimeout(120000);

let mongo;
const oid = () => new mongoose.Types.ObjectId();
const KEY = "farmOperationsManagement";

async function seed({ features, status = "active", endDate = null }) {
  const planId = oid();
  const fieldId = oid();
  await SubscriptionPlan.collection.insertOne({ _id: planId, name: "p", slug: String(planId), ...(features ? { features } : {}) });
  await UserSubscription.collection.insertOne({
    _id: oid(), userId: oid(), fieldId, planId, status, endDate, startDate: new Date(),
  });
  return fieldId;
}

const mockRes = () => {
  const res = { statusCode: 200 };
  res.status = (c) => ((res.statusCode = c), res);
  res.json = (b) => ((res.body = b), res);
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

describe("fieldLacksPlanFeature", () => {
  test("denies when active plan has the flag off", async () => {
    const f = await seed({ features: { [KEY]: false, cropCalendar: true } });
    expect(await fieldLacksPlanFeature(f, KEY)).toBe(true);
  });

  test("allows when active plan has the flag on", async () => {
    const f = await seed({ features: { [KEY]: true } });
    expect(await fieldLacksPlanFeature(f, KEY)).toBe(false);
  });

  test("all-false features map denies", async () => {
    const f = await seed({ features: { [KEY]: false, cropCalendar: false } });
    expect(await fieldLacksPlanFeature(f, KEY)).toBe(true);
  });

  test("fails open when nothing can be resolved", async () => {
    expect(await fieldLacksPlanFeature(oid(), KEY)).toBe(false); // no subscription
    expect(await fieldLacksPlanFeature("not-an-id", KEY)).toBe(false);
    expect(await fieldLacksPlanFeature(await seed({ features: null }), KEY)).toBe(false); // no features map
    expect(await fieldLacksPlanFeature(await seed({ features: { [KEY]: false }, status: "pending" }), KEY)).toBe(false);
  });

  test("expired subscription is not treated as live", async () => {
    const f = await seed({ features: { [KEY]: false }, endDate: new Date(Date.now() - 86400000) });
    expect(await fieldLacksPlanFeature(f, KEY)).toBe(false);
  });
});

describe("middleware", () => {
  test("requirePlanFeature returns 403 FEATURE_NOT_IN_PLAN, else calls next", async () => {
    const locked = await seed({ features: { [KEY]: false } });
    const open = await seed({ features: { [KEY]: true } });

    const res = mockRes();
    const next = jest.fn();
    await requirePlanFeature(KEY)({ params: { farmFieldId: String(locked) } }, res, next);
    expect(res.statusCode).toBe(403);
    expect(res.body.code).toBe("FEATURE_NOT_IN_PLAN");
    expect(next).not.toHaveBeenCalled();

    const next2 = jest.fn();
    await requirePlanFeature(KEY)({ params: { farmFieldId: String(open) } }, mockRes(), next2);
    expect(next2).toHaveBeenCalled();
  });

  test("requireOperationPlanFeature resolves the field from the operation", async () => {
    const locked = await seed({ features: { [KEY]: false } });
    const opId = oid();
    await Operation.collection.insertOne({ _id: opId, farmField: locked });

    const res = mockRes();
    const next = jest.fn();
    await requireOperationPlanFeature(KEY)({ params: { operationId: String(opId) } }, res, next);
    expect(res.statusCode).toBe(403);
    expect(next).not.toHaveBeenCalled();

    const next2 = jest.fn();
    await requireOperationPlanFeature(KEY)({ params: { operationId: String(oid()) } }, mockRes(), next2);
    expect(next2).toHaveBeenCalled(); // unknown operation: pass through to the controller's 404
  });
});

describe("requireBodyFieldPlanFeature (soil report)", () => {
  const SOIL = "soilReportGeneration";
  const run = async (body, user, opts) => {
    const res = mockRes();
    const next = jest.fn();
    await requireBodyFieldPlanFeature(SOIL, opts)({ body, user }, res, next);
    return { res, next };
  };
  const seedOwned = async (features, ownerId) => {
    const fieldId = await seed({ features });
    await FarmField.collection.insertOne({ _id: fieldId, user: ownerId });
    return fieldId;
  };

  test("owner on a plan with the flag passes; without it gets 403", async () => {
    const owner = oid();
    const ok = await seedOwned({ [SOIL]: true }, owner);
    const no = await seedOwned({ [SOIL]: false }, owner);
    const user = { id: String(owner), role: "farmer" };

    expect((await run({ fieldId: String(ok) }, user)).next).toHaveBeenCalled();
    const denied = await run({ fieldId: String(no) }, user);
    expect(denied.res.statusCode).toBe(403);
    expect(denied.res.body.code).toBe("FEATURE_NOT_IN_PLAN");
    expect(denied.next).not.toHaveBeenCalled();
  });

  test("fieldId without a token is 401; another farmer's field is 403", async () => {
    const f = await seedOwned({ [SOIL]: true }, oid());
    expect((await run({ fieldId: String(f) }, undefined)).res.statusCode).toBe(401);
    expect(
      (await run({ fieldId: String(f) }, { id: String(oid()), role: "farmer" })).res.statusCode,
    ).toBe(403);
    // staff may act on a field they manage
    expect(
      (await run({ fieldId: String(f) }, { id: String(oid()), role: "staff" })).next,
    ).toHaveBeenCalled();
  });

  test("bad / unknown fieldId", async () => {
    const user = { id: String(oid()), role: "farmer" };
    expect((await run({ fieldId: "nope" }, user)).res.statusCode).toBe(400);
    expect((await run({ fieldId: String(oid()) }, user)).res.statusCode).toBe(404);
  });

  test("missing fieldId passes until the env switch is on", async () => {
    expect((await run({}, undefined)).next).toHaveBeenCalled();
    process.env.TEST_REQUIRE_FIELD = "true";
    const strict = await run({}, undefined, { requireEnv: "TEST_REQUIRE_FIELD" });
    expect(strict.res.statusCode).toBe(400);
    expect(strict.res.body.code).toBe("FIELD_ID_REQUIRED");
    delete process.env.TEST_REQUIRE_FIELD;
  });
});
