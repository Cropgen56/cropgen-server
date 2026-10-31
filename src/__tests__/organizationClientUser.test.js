/**
 * Changing an organization's email must not leave the old email's client
 * login behind as an extra admin user.
 * Runs against an in-memory MongoDB — never the database in .env.
 */
import { jest } from "@jest/globals";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";

jest.setTimeout(120000);

let mongo;
let User;
let Organization;
let ensureOrganizationClientUser;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  User = (await import("../models/user.model.js")).default;
  Organization = (await import("../models/organization.model.js")).default;
  ({ ensureOrganizationClientUser } = await import("../utils/auth/orgScope.js"));
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

beforeEach(async () => {
  await mongoose.connection.db.dropDatabase();
});

async function makeOrg(email) {
  return Organization.create({
    organizationName: "Test Org",
    organizationCode: "TST",
    email,
  });
}

async function activeClients(org) {
  return User.find({ organization: org._id, role: "client", deletedAt: null }).lean();
}

test("moves the existing client login to the new email", async () => {
  const org = await makeOrg("old@example.com");
  const original = await ensureOrganizationClientUser(org);

  org.email = "new@example.com";
  await org.save();
  const moved = await ensureOrganizationClientUser(org, { previousEmail: "old@example.com" });

  expect(String(moved._id)).toBe(String(original._id));
  const clients = await activeClients(org);
  expect(clients).toHaveLength(1);
  expect(clients[0].email).toBe("new@example.com");
});

test("retires the old client when the new email already has an account", async () => {
  const org = await makeOrg("old@example.com");
  const original = await ensureOrganizationClientUser(org);
  const existing = await User.create({ email: "new@example.com", role: "farmer", terms: true });

  org.email = "new@example.com";
  await org.save();
  const result = await ensureOrganizationClientUser(org, { previousEmail: "old@example.com" });

  expect(String(result._id)).toBe(String(existing._id));
  const clients = await activeClients(org);
  expect(clients.map((c) => c.email)).toEqual(["new@example.com"]);
  const retired = await User.findById(original._id).lean();
  expect(retired.deletedAt).toBeTruthy();
  expect(retired.email).toBeUndefined();
  expect(await User.countDocuments({ email: "old@example.com" })).toBe(0);
});

test("saving without an email change keeps the same single client", async () => {
  const org = await makeOrg("same@example.com");
  const first = await ensureOrganizationClientUser(org);
  const again = await ensureOrganizationClientUser(org, { previousEmail: "same@example.com" });

  expect(String(again._id)).toBe(String(first._id));
  expect(await activeClients(org)).toHaveLength(1);
});
