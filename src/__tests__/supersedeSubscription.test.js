/**
 * Changing a farm's plan retires the previous plan and its Razorpay autopay.
 * In-memory MongoDB and a mocked Razorpay service: nothing touches the network.
 */
import { jest } from "@jest/globals";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";

jest.setTimeout(120000);

const cancelled = [];
const real = await import("../services/razorpay.subscription.service.js");
let failCancel = false;
jest.unstable_mockModule("../services/razorpay.subscription.service.js", () => ({
  ...real,
  razorpayClientsFor: () => [{ tag: "cropgen" }, { tag: "biodrops" }],
  cancelRazorpaySubscriptionBestEffort: async (client, id) => {
    if (failCancel) throw new Error("razorpay down");
    cancelled.push([client.tag, id]);
  },
}));

const { default: UserSubscription } = await import("../models/user-subscription.model.js");
const { supersedeActiveSubscriptions } = await import(
  "../services/subscription.supersede.service.js"
);

let mongo;
const oid = () => new mongoose.Types.ObjectId();
const row = (userId, fieldId, extra = {}) => ({
  _id: oid(), userId, fieldId, planId: oid(), platform: "web", area: 2, unit: "acre",
  pricePerUnitMinor: 100, totalAmountMinor: 200, billingCycle: "monthly", status: "active",
  startDate: new Date(), endDate: new Date(Date.now() + 86400000), ...extra,
});

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
  failCancel = false;
});

describe("supersedeActiveSubscriptions", () => {
  test("retires the farm's previous plan and cancels its autopay", async () => {
    const userId = oid(), fieldId = oid(), otherField = oid();
    const oldPaid = row(userId, fieldId, { razorpaySubscriptionId: "sub_old" });
    const oldTrial = row(userId, fieldId, { billingCycle: "trial", razorpaySubscriptionId: "sub_trial" });
    const otherFarm = row(userId, otherField, { razorpaySubscriptionId: "sub_other" });
    const next = row(userId, fieldId, { razorpaySubscriptionId: "sub_new" });
    await UserSubscription.collection.insertMany([oldPaid, oldTrial, otherFarm, next]);

    const n = await supersedeActiveSubscriptions(next);
    expect(n).toBe(2);

    const status = async (r) => (await UserSubscription.collection.findOne({ _id: r._id })).status;
    expect(await status(oldPaid)).toBe("expired");
    expect(await status(oldTrial)).toBe("expired");
    expect(await status(next)).toBe("active");
    expect(await status(otherFarm)).toBe("active"); // another farm is untouched

    const ids = cancelled.map(([, id]) => id);
    expect(ids).toContain("sub_old");
    expect(ids).toContain("sub_trial");
    expect(ids).not.toContain("sub_new");
    expect(ids).not.toContain("sub_other");
  });

  test("nothing to retire: no-op", async () => {
    const userId = oid(), fieldId = oid();
    const only = row(userId, fieldId);
    await UserSubscription.collection.insertOne(only);
    expect(await supersedeActiveSubscriptions(only)).toBe(0);
    expect(cancelled).toHaveLength(0);
  });

  test("a Razorpay failure never blocks the new plan; the old row still stops granting access", async () => {
    const userId = oid(), fieldId = oid();
    const oldPaid = row(userId, fieldId, { razorpaySubscriptionId: "sub_old2" });
    const next = row(userId, fieldId, { razorpaySubscriptionId: "sub_new2" });
    await UserSubscription.collection.insertMany([oldPaid, next]);
    failCancel = true;
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});
    await expect(supersedeActiveSubscriptions(next)).resolves.toBe(1);
    spy.mockRestore();
    expect((await UserSubscription.collection.findOne({ _id: oldPaid._id })).status).toBe("expired");
  });

  test("a row without autopay (admin-activated, legacy) is just expired", async () => {
    const userId = oid(), fieldId = oid();
    const admin = row(userId, fieldId, { activatedByAdmin: true });
    const next = row(userId, fieldId, { razorpaySubscriptionId: "sub_new3" });
    await UserSubscription.collection.insertMany([admin, next]);
    expect(await supersedeActiveSubscriptions(next)).toBe(1);
    expect(cancelled).toHaveLength(0);
  });
});
