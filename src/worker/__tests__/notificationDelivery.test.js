/**
 * End-to-end delivery check for notifications: real Notification rows in an
 * in-memory MongoDB, the real worker send logic, and mocked WhatsApp / SES
 * clients. Nothing reaches WhatsApp, SES or the production database.
 */
import { jest } from "@jest/globals";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";

jest.setTimeout(120000);

const sendWhatsAppTemplateMock = jest.fn(async () => ({ data: { messages: [{ id: "wamid.test" }] } }));
const sendBasicEmailMock = jest.fn(async () => ({ MessageId: "ses-test" }));

jest.unstable_mockModule("../../services/whatsapp.service.js", () => ({
  sendWhatsAppTemplate: sendWhatsAppTemplateMock,
}));
jest.unstable_mockModule("../../config/sesClient.js", () => ({
  sendBasicEmail: sendBasicEmailMock,
}));

let mongo;
let Notification;
let processNotification;
const users = {};

// Same populate the worker uses when it picks a notification up.
const loadUser = (key) =>
  mongoose.connection.db.collection("users").findOne({ _id: users[key] }).then(async (u) => {
    const { default: User } = await import("../../models/user.model.js");
    return User.findById(u._id).populate("organization", "organizationCode");
  });

const typeFor = (templateName) =>
  templateName === "plan_activation_notification" ? "SUBSCRIPTION_ACTIVATION"
  : templateName.startsWith("plan_expiry") ? "SUBSCRIPTION_EXPIRY"
  : "ADVISORY";

async function makeNotification(userKey, templateName, parameters) {
  const user = await loadUser(userKey);
  const { insertedId } = await Notification.collection.insertOne({
    userId: user._id,
    type: typeFor(templateName),
    referenceId: new mongoose.Types.ObjectId(),
    templateName,
    parameters,
    status: "processing",
    retryCount: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  return loadNotification(insertedId);
}

const loadNotification = (id) =>
  Notification.findById(id).populate({
    path: "userId",
    populate: { path: "organization", select: "organizationCode" },
  });

const advisoryParams = ["Ravi", "26-11-2026", "Sugarcane", "Field 1", "2.00 Acre",
  "Spray test", "Fertigation test", "Irrigation test", "Weather test", "Risk test", "Monitoring test", "Carbon test"];
const activationParams = ["Ravi", "Test Plan", "Satagro", "Monthly", "Sugarcane", "Field 1", "2.00", "01-11-2026", "30-11-2026"];
const expiryParams = ["Ravi", "Test Plan", "Satagro", "Monthly", "Sugarcane", "Field 1", "2.00", "01-11-2026", "30-11-2026", "3"];

beforeAll(async () => {
  process.env.SES_FROM_EMAIL = "info@cropgenapp.com";
  process.env.SES_FROM_EMAIL_BIODROPS = "info@satagro.ai";
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());

  ({ default: Notification } = await import("../../models/notification.model.js"));
  await import("../../models/user.model.js");
  await import("../../models/organization.model.js");
  ({ processNotification } = await import("../notification.worker.js"));

  const orgs = await mongoose.connection.db.collection("organizations").insertMany([
    { organizationCode: "CROPGEN", name: "CropGen" },
    { organizationCode: "BIODROPS", name: "Satagro" },
  ]);
  const org = { CROPGEN: orgs.insertedIds[0], BIODROPS: orgs.insertedIds[1] };

  const mk = async (key, organization, fields) => {
    const { insertedId } = await mongoose.connection.db.collection("users").insertOne({
      firstName: "Ravi", organization, createdAt: new Date(), updatedAt: new Date(), ...fields,
    });
    users[key] = insertedId;
  };
  await mk("cropgenPhone", org.CROPGEN, { phone: "+919000000001", email: "c1@example.com" });
  await mk("cropgenEmailOnly", org.CROPGEN, { email: "c2@example.com" });
  await mk("satagroPhone", org.BIODROPS, { phone: "+919000000002", email: "s1@example.com" });
  await mk("satagroEmailOnly", org.BIODROPS, { email: "s2@example.com" });
  await mk("nothing", org.CROPGEN, {});
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

beforeEach(() => {
  sendWhatsAppTemplateMock.mockClear();
  sendBasicEmailMock.mockClear();
  sendWhatsAppTemplateMock.mockImplementation(async () => ({ data: { messages: [{ id: "wamid.test" }] } }));
});

const emailCall = () => sendBasicEmailMock.mock.calls[0][0];

describe("WhatsApp delivery (users with a phone)", () => {
  test("CropGen advisory goes out as the CropGen 'advisory' template", async () => {
    const n = await makeNotification("cropgenPhone", "advisory", advisoryParams);
    await processNotification(n);
    expect(sendWhatsAppTemplateMock.mock.calls[0][0]).toMatchObject({
      templateName: "advisory", organizationCode: "CROPGEN", to: "919000000001",
    });
    const row = await Notification.findById(n._id).lean();
    expect(row.status).toBe("sent");
    expect(row.channel).toBe("whatsapp");
  });

  test("Satagro plan activation goes out via the Satagro number and template", async () => {
    const n = await makeNotification("satagroPhone", "plan_activation_notification", activationParams);
    await processNotification(n);
    expect(sendWhatsAppTemplateMock.mock.calls[0][0]).toMatchObject({
      templateName: "plan_activation_notification", organizationCode: "BIODROPS", to: "919000000002",
    });
    expect((await Notification.findById(n._id).lean()).status).toBe("sent");
  });
});

describe("Email delivery (users with no phone)", () => {
  test("CropGen expiry reminder is the CropGen expiry email, not the generic fallback", async () => {
    const n = await makeNotification("cropgenEmailOnly", "plan_expiry_reminder_notification", expiryParams);
    await processNotification(n);
    expect(sendWhatsAppTemplateMock).not.toHaveBeenCalled();
    const mail = emailCall();
    expect(mail.to).toBe("c2@example.com");
    expect(mail.from).toBe("info@cropgenapp.com");
    expect(mail.subject).toBe("Your CropGen Subscription is Expiring Soon ⏳");
    expect(mail.html).not.toMatch(/Please check your CropGen account/);
    expect((await Notification.findById(n._id).lean()).channel).toBe("email");
  });

  test("Satagro email-only user gets the Satagro advisory from the Satagro sender", async () => {
    const n = await makeNotification("satagroEmailOnly", "farm_advisory", advisoryParams);
    await processNotification(n);
    const mail = emailCall();
    expect(mail).toMatchObject({ to: "s2@example.com", preset: "biodrops" });
    expect(mail.from).toBeUndefined();
    expect(mail.subject).toBe("Satagro Smart Farm Advisory");
    expect(mail.html).toMatch(/Satagro Smart Farm Advisory/);
    expect(mail.html).toMatch(/Spray test/);
    expect(mail.html).not.toMatch(/CropGen/);
    expect((await Notification.findById(n._id).lean()).status).toBe("sent");
  });

  test("Satagro email-only user gets the Satagro activation email", async () => {
    const n = await makeNotification("satagroEmailOnly", "plan_activation_notification", activationParams);
    await processNotification(n);
    expect(emailCall()).toMatchObject({ preset: "biodrops", subject: "Your Satagro Plan is Activated ✅" });
  });
});

describe("Failure handling", () => {
  test("a user with neither phone nor email is retried and then marked failed after 3 tries", async () => {
    let n = await makeNotification("nothing", "advisory", advisoryParams);
    for (let i = 0; i < 3; i++) {
      n = await loadNotification(n._id);
      await processNotification(n);
    }
    const row = await Notification.findById(n._id).lean();
    expect(row.retryCount).toBe(3);
    expect(row.status).toBe("failed");
    expect(row.error).toMatch(/No contact method/);
  });

  test("a WhatsApp error keeps the row pending for retry", async () => {
    sendWhatsAppTemplateMock.mockImplementationOnce(async () => {
      throw Object.assign(new Error("Request failed"), { response: { data: { error: { message: "rate limited" } } } });
    });
    const n = await makeNotification("cropgenPhone", "advisory", advisoryParams);
    await processNotification(n);
    const row = await Notification.findById(n._id).lean();
    expect(row.retryCount).toBe(1);
    expect(row.status).toBe("pending");
    expect(row.error).toBe("rate limited");
  });
});
