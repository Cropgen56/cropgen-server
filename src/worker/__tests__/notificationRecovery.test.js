/**
 * Notifications left in "processing" by an interrupted worker are recovered:
 * recent ones are requeued (or failed after the last retry), old ones skipped.
 * In-memory MongoDB; nothing is sent.
 */
import { jest } from "@jest/globals";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";

jest.setTimeout(120000);

jest.unstable_mockModule("../../services/whatsapp.service.js", () => ({
  sendWhatsAppTemplate: jest.fn(),
}));
jest.unstable_mockModule("../../config/sesClient.js", () => ({
  sendBasicEmail: jest.fn(),
}));

let mongo;
let Notification;
let recoverStuckNotifications;

const NOW = new Date("2026-11-25T12:00:00Z");
const ago = (ms) => new Date(NOW.getTime() - ms);
const MIN = 60 * 1000;
const DAY = 24 * 60 * MIN;

async function insert({ status = "processing", retryCount = 0, createdAgo, updatedAgo }) {
  const { insertedId } = await Notification.collection.insertOne({
    userId: new mongoose.Types.ObjectId(),
    type: "ADVISORY",
    templateName: "advisory",
    parameters: [],
    status,
    retryCount,
    createdAt: ago(createdAgo),
    updatedAt: ago(updatedAgo),
  });
  return insertedId;
}
const load = (id) => Notification.collection.findOne({ _id: id });

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  ({ default: Notification } = await import("../../models/notification.model.js"));
  ({ recoverStuckNotifications } = await import("../notification.worker.js"));
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

beforeEach(async () => {
  await Notification.collection.deleteMany({});
});

test("months-old stuck notifications are skipped, never sent", async () => {
  const id = await insert({ createdAgo: 170 * DAY, updatedAgo: 170 * DAY, retryCount: 2 });
  const counts = await recoverStuckNotifications(NOW);
  const row = await load(id);
  expect(counts).toEqual({ skipped: 1, failed: 0, requeued: 0 });
  expect(row.status).toBe("skipped");
  expect(row.retryCount).toBe(2);
});

test("a recent stuck notification goes back to pending with a retry counted", async () => {
  const id = await insert({ createdAgo: 30 * MIN, updatedAgo: 20 * MIN, retryCount: 0 });
  await recoverStuckNotifications(NOW);
  const row = await load(id);
  expect(row.status).toBe("pending");
  expect(row.retryCount).toBe(1);
});

test("a recent stuck notification on its last retry is marked failed", async () => {
  const id = await insert({ createdAgo: 2 * 60 * MIN, updatedAgo: 20 * MIN, retryCount: 2 });
  await recoverStuckNotifications(NOW);
  const row = await load(id);
  expect(row.status).toBe("failed");
  expect(row.retryCount).toBe(3);
});

test("a notification being sent right now, and finished ones, are left alone", async () => {
  const inFlight = await insert({ createdAgo: 2 * MIN, updatedAgo: 1 * MIN });
  const sent = await insert({ status: "sent", createdAgo: 10 * DAY, updatedAgo: 10 * DAY });
  const counts = await recoverStuckNotifications(NOW);
  expect(counts).toEqual({ skipped: 0, failed: 0, requeued: 0 });
  expect((await load(inFlight)).status).toBe("processing");
  expect((await load(sent)).status).toBe("sent");
});
