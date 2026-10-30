/**
 * BioDrops client organizations: client logins see only their own farmers.
 * Runs against an in-memory MongoDB — never the database in .env.
 */
import { jest } from "@jest/globals";
import express from "express";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import request from "supertest";
import { MongoMemoryServer } from "mongodb-memory-server";

jest.setTimeout(120000);

// Must be set before the app modules load (auth middleware reads them at import).
process.env.JWT_ACCESS_SECRET = "test-access-secret";
process.env.JWT_REFRESH_SECRET = "test-refresh-secret";
// Dummy SES credentials so no email can ever be delivered from a test run.
process.env.AWS_REGION_CROPGEN = "us-east-1";
process.env.AWS_ACCESS_KEY_ID_CROPGEN = "test";
process.env.AWS_SECRET_ACCESS_KEY_CROPGEN = "test";

let mongo;
let app;
let User;
let Organization;
let FarmField;
let BiodropsAdminAssignment;
let biodrops;

const ids = {};

function tokenFor(user) {
  return jwt.sign(
    { id: String(user._id), role: user.role, organization: String(user.organization) },
    process.env.JWT_ACCESS_SECRET,
    { expiresIn: "1h" },
  );
}

const asUser = (user) => ({ Authorization: `Bearer ${tokenFor(user)}` });

async function createFarmer(attrs) {
  return User.create({
    role: "farmer",
    terms: true,
    organization: biodrops._id,
    country: "IN",
    state: "MH",
    district: "Pune",
    ...attrs,
  });
}

async function createField(user) {
  // Raw insert: skips the model's post-save advisory hooks.
  const { insertedId } = await FarmField.collection.insertOne({
    user: user._id,
    fieldName: `Field of ${user.firstName}`,
    acre: 2,
    field: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  return insertedId;
}

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  process.env.MONGO_URI = mongo.getUri();
  await mongoose.connect(mongo.getUri());

  ({ default: User } = await import("../../../models/user.model.js"));
  ({ default: Organization } = await import("../../../models/organization.model.js"));
  ({ default: FarmField } = await import("../../../models/field.model.js"));
  ({ default: BiodropsAdminAssignment } = await import("../models/admin-assignment.model.js"));
  const { default: biodropsRoutes } = await import("../routes/index.js");
  const { isAuthenticated } = await import("../../../middleware/auth.middleware.js");
  const { getProfile } = await import("../../../controllers/auth/profile.controller.js");

  app = express();
  app.use(express.json());
  app.use("/v1/api/auth", biodropsRoutes);
  app.get("/v1/api/auth/profile", isAuthenticated, getProfile);

  biodrops = await Organization.create({
    organizationName: "BioDrops",
    organizationCode: "BIODROPS",
  });

  ids.platformAdmin = await User.create({
    email: "platform@example.test",
    role: "admin",
    terms: true,
    organization: biodrops._id,
  });

  ids.districtStaff = await User.create({
    email: "district@example.test",
    role: "staff",
    terms: true,
    organization: biodrops._id,
  });
  await BiodropsAdminAssignment.create({
    userId: ids.districtStaff._id,
    level: "district",
    tenantId: biodrops._id,
    countryCode: "IN",
    stateCode: "MH",
    districtCode: "PUNE",
  });
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});

describe("client management", () => {
  test("platform admin creates a client with a generated code and a client login", async () => {
    const res = await request(app)
      .post("/v1/api/auth/crm/clients")
      .set(asUser(ids.platformAdmin))
      .send({
        organizationName: "Green Valley FPO",
        email: "Client@Example.test",
        sendWelcomeEmail: false,
      });

    expect(res.status).toBe(201);
    expect(res.body.client.organizationCode).toMatch(/^BD-[A-Z0-9]{6}$/);
    expect(res.body.client.status).toBe("active");

    ids.client = await Organization.findById(res.body.client.id);
    expect(String(ids.client.parentOrganization)).toBe(String(biodrops._id));

    ids.clientViewer = await User.findOne({ email: "client@example.test" });
    expect(ids.clientViewer.role).toBe("staff");
    expect(String(ids.clientViewer.organization)).toBe(String(biodrops._id));
    expect(String(ids.clientViewer.clientOrganization)).toBe(String(ids.client._id));
  });

  test("rejects a login email that already belongs to an account", async () => {
    const res = await request(app)
      .post("/v1/api/auth/crm/clients")
      .set(asUser(ids.platformAdmin))
      .send({ organizationName: "Dup", email: "district@example.test", sendWelcomeEmail: false });
    expect(res.status).toBe(409);
  });

  test("rejects a custom code that is already used by any organization", async () => {
    const res = await request(app)
      .post("/v1/api/auth/crm/clients")
      .set(asUser(ids.platformAdmin))
      .send({
        organizationName: "Dup code",
        email: "dupcode@example.test",
        organizationCode: "biodrops",
        sendWelcomeEmail: false,
      });
    expect(res.status).toBe(409);
  });

  test("a 10-digit phone is stored in +91 format on the client and its login", async () => {
    const res = await request(app)
      .post("/v1/api/auth/crm/clients")
      .set(asUser(ids.platformAdmin))
      .send({
        organizationName: "Phone Test FPO",
        email: "phone-client@example.test",
        phoneNumber: "87097 06576",
        sendWelcomeEmail: false,
      });

    expect(res.status).toBe(201);
    expect(res.body.client.phoneNumber).toBe("+918709706576");
    const login = await User.findOne({ email: "phone-client@example.test" });
    expect(login.phone).toBe("+918709706576");
  });

  test("an invalid or already used phone is rejected without creating a client", async () => {
    const before = await Organization.countDocuments();
    const send = (phoneNumber, email) =>
      request(app)
        .post("/v1/api/auth/crm/clients")
        .set(asUser(ids.platformAdmin))
        .send({ organizationName: "Bad Phone FPO", email, phoneNumber, sendWelcomeEmail: false });

    const invalid = await send("12345", "bad-phone@example.test");
    expect(invalid.status).toBe(400);
    expect(invalid.body.message).toMatch(/valid phone number/);

    const taken = await send("8709706576", "taken-phone@example.test");
    expect(taken.status).toBe(409);
    expect(taken.body.message).toMatch(/phone number already belongs/);

    expect(await Organization.countDocuments()).toBe(before);
  });

  test("admin edits the login email and contact name on the client and its login", async () => {
    const edit = (body) =>
      request(app)
        .patch(`/v1/api/auth/crm/clients/${ids.client._id}`)
        .set(asUser(ids.platformAdmin))
        .send(body);

    const res = await edit({ email: " New.Login@Example.test ", contactName: "Asha Rao Patil" });
    expect(res.status).toBe(200);
    expect(res.body.client.logins[0]).toMatchObject({
      email: "new.login@example.test",
      name: "Asha Rao Patil",
    });

    const login = await User.findById(ids.clientViewer._id);
    expect(login.email).toBe("new.login@example.test");
    expect(login.firstName).toBe("Asha");
    expect(login.lastName).toBe("Rao Patil");
    expect((await Organization.findById(ids.client._id)).email).toBe("new.login@example.test");

    // Restore so later tests see the original login.
    expect((await edit({ email: "client@example.test" })).status).toBe(200);
  });

  test("rejects editing to an invalid email or one used by another account", async () => {
    const edit = (email) =>
      request(app)
        .patch(`/v1/api/auth/crm/clients/${ids.client._id}`)
        .set(asUser(ids.platformAdmin))
        .send({ email });

    expect((await edit("not-an-email")).status).toBe(400);
    expect((await edit("Platform@Example.test")).status).toBe(409);
    expect((await User.findById(ids.clientViewer._id)).email).toBe("client@example.test");
  });

  test("district staff (not super) cannot manage clients", async () => {
    const res = await request(app)
      .get("/v1/api/auth/crm/clients")
      .set(asUser(ids.districtStaff));
    expect(res.status).toBe(403);
  });
});

describe("signup with an organization code", () => {
  test("code check reports valid codes and the client name", async () => {
    const ok = await request(app).get(
      `/v1/api/auth/biodrops/client-code/${ids.client.organizationCode.toLowerCase()}`,
    );
    expect(ok.body).toMatchObject({ valid: true, organizationName: "Green Valley FPO" });

    const bad = await request(app).get("/v1/api/auth/biodrops/client-code/NOPE-123");
    expect(bad.body.valid).toBe(false);

    // A top-level org's code is not a client code.
    const parent = await request(app).get("/v1/api/auth/biodrops/client-code/BIODROPS");
    expect(parent.body.valid).toBe(false);
  });

  async function placeholderUser(email) {
    return User.create({ email, terms: false, role: "farmer", organization: biodrops._id });
  }

  const profile = {
    terms: true,
    firstName: "Asha",
    lastName: "Patil",
    country: "IN",
    state: "MH",
    city: "Pune",
    village: "Wagholi",
    pincode: "412207",
  };

  test("farmer who enters a valid code is tagged with the client and stays in BIODROPS", async () => {
    const user = await placeholderUser("asha@example.test");
    const res = await request(app)
      .post("/v1/api/auth/biodrops/signup/complete-profile")
      .set(asUser(user))
      .send({ ...profile, clientCode: ids.client.organizationCode, role: "admin" });

    expect(res.status).toBe(201);
    const saved = await User.findById(user._id);
    expect(saved.role).toBe("farmer"); // role in the body is ignored
    expect(String(saved.organization)).toBe(String(biodrops._id));
    expect(String(saved.clientOrganization)).toBe(String(ids.client._id));
    ids.farmerViaCode = saved;
  });

  test("an invalid code is rejected and the profile is not completed", async () => {
    const user = await placeholderUser("typo@example.test");
    const res = await request(app)
      .post("/v1/api/auth/biodrops/signup/complete-profile")
      .set(asUser(user))
      .send({ ...profile, clientCode: "BD-WRONG1" });

    expect(res.status).toBe(400);
    const saved = await User.findById(user._id);
    expect(saved.terms).toBe(false);
    expect(saved.clientOrganization).toBeNull();
  });

  test("no code registers a direct BioDrops farmer", async () => {
    const user = await placeholderUser("direct@example.test");
    const res = await request(app)
      .post("/v1/api/auth/biodrops/signup/complete-profile")
      .set(asUser(user))
      .send(profile);

    expect(res.status).toBe(201);
    const saved = await User.findById(user._id);
    expect(saved.clientOrganization).toBeNull();
    ids.directFarmer = saved;
  });
});

describe("client viewer scope", () => {
  beforeAll(async () => {
    ids.clientField = await createField(ids.farmerViaCode);
    ids.directField = await createField(ids.directFarmer);
  });

  test("farmer list contains only the client's farmers", async () => {
    const res = await request(app)
      .get("/v1/api/auth/crm/farmers")
      .set(asUser(ids.clientViewer));

    expect(res.status).toBe(200);
    expect(res.body.farmers.map((f) => f.id)).toEqual([String(ids.farmerViaCode._id)]);
    expect(res.body.farmers[0].client).toMatchObject({ name: "Green Valley FPO" });
  });

  test("farmer detail, fields and advisories work for own farmers only", async () => {
    const own = String(ids.farmerViaCode._id);
    const other = String(ids.directFarmer._id);
    const viewer = asUser(ids.clientViewer);

    expect((await request(app).get(`/v1/api/auth/crm/farmers/${own}`).set(viewer)).status).toBe(200);
    expect((await request(app).get(`/v1/api/auth/crm/farmers/${other}`).set(viewer)).status).toBe(404);

    const fields = await request(app).get(`/v1/api/auth/crm/farmers/${own}/fields`).set(viewer);
    expect(fields.status).toBe(200);
    expect(fields.body.farmFields).toHaveLength(1);
    expect((await request(app).get(`/v1/api/auth/crm/farmers/${other}/fields`).set(viewer)).status).toBe(404);

    expect(
      (await request(app).get(`/v1/api/auth/crm/fields/${ids.clientField}/advisories`).set(viewer)).status,
    ).toBe(200);
    expect(
      (await request(app).get(`/v1/api/auth/crm/fields/${ids.directField}/advisories`).set(viewer)).status,
    ).toBe(404);
  });

  test("every non-monitoring route is denied", async () => {
    const viewer = asUser(ids.clientViewer);
    const own = String(ids.farmerViaCode._id);
    const denied = [
      request(app).get("/v1/api/auth/crm/orders").set(viewer),
      request(app).get("/v1/api/auth/crm/products").set(viewer),
      request(app).get("/v1/api/auth/crm/user-management").set(viewer),
      request(app).get("/v1/api/auth/crm/subscriptions").set(viewer),
      request(app).get(`/v1/api/auth/crm/farmers/${own}/subscriptions`).set(viewer),
      request(app).post(`/v1/api/auth/crm/farmers/${own}/subscriptions/activate`).set(viewer).send({}),
      request(app).get("/v1/api/auth/crm/clients").set(viewer),
      request(app).patch(`/v1/api/auth/crm/farmers/${own}/client`).set(viewer).send({ clientId: null }),
    ];
    for (const res of await Promise.all(denied)) {
      expect(res.status).toBe(403);
    }
  });

  test("farmers registered under a client have no CRM access", async () => {
    const farmer = asUser(ids.farmerViaCode);
    const own = String(ids.farmerViaCode._id);
    const denied = [
      request(app).get("/v1/api/auth/crm/farmers").set(farmer),
      request(app).get("/v1/api/auth/crm/farmers/stats").set(farmer),
      request(app).get(`/v1/api/auth/crm/farmers/${own}`).set(farmer),
      request(app).get("/v1/api/auth/crm/clients").set(farmer),
    ];
    for (const res of await Promise.all(denied)) {
      expect(res.status).toBe(403);
    }
  });

  test("profile carries the client org and its code for the CRM settings page", async () => {
    const res = await request(app)
      .get("/v1/api/auth/profile")
      .set(asUser(ids.clientViewer));

    expect(res.status).toBe(200);
    expect(res.body.user.clientOrganization).toMatchObject({
      organizationName: "Green Valley FPO",
      organizationCode: ids.client.organizationCode,
      email: "client@example.test",
      status: "active",
    });
  });

  test("regional staff scope is unchanged", async () => {
    await User.updateMany(
      { _id: { $in: [ids.farmerViaCode._id, ids.directFarmer._id] } },
      { $set: { district: "Pune" } },
    );
    const res = await request(app)
      .get("/v1/api/auth/crm/farmers")
      .set(asUser(ids.districtStaff));
    expect(res.status).toBe(200);
    const listed = res.body.farmers.map((f) => f.id);
    expect(listed).toEqual(
      expect.arrayContaining([String(ids.farmerViaCode._id), String(ids.directFarmer._id)]),
    );
  });
});

describe("assigning existing farmers", () => {
  test("admin attaches a direct farmer, and the client then sees them", async () => {
    const res = await request(app)
      .patch(`/v1/api/auth/crm/farmers/${ids.directFarmer._id}/client`)
      .set(asUser(ids.platformAdmin))
      .send({ clientId: String(ids.client._id) });
    expect(res.status).toBe(200);

    const list = await request(app).get("/v1/api/auth/crm/farmers").set(asUser(ids.clientViewer));
    expect(list.body.farmers).toHaveLength(2);
  });

  test("admin can filter the farmer list by client", async () => {
    const extra = await createFarmer({ firstName: "Unassigned", phone: "+919999000001" });
    const admin = asUser(ids.platformAdmin);

    const byClient = await request(app)
      .get(`/v1/api/auth/crm/farmers?clientId=${ids.client._id}`)
      .set(admin);
    expect(byClient.body.farmers.every((f) => f.client?.id === String(ids.client._id))).toBe(true);

    const none = await request(app).get("/v1/api/auth/crm/farmers?clientId=none").set(admin);
    expect(none.body.farmers.map((f) => f.id)).toContain(String(extra._id));
    expect(none.body.farmers.every((f) => !f.client)).toBe(true);
  });

  test("a client viewer cannot widen scope with ?clientId", async () => {
    const res = await request(app)
      .get("/v1/api/auth/crm/farmers?clientId=none")
      .set(asUser(ids.clientViewer));
    expect(res.body.farmers.every((f) => f.client?.id === String(ids.client._id))).toBe(true);
  });
});

describe("deactivated clients", () => {
  beforeAll(async () => {
    const res = await request(app)
      .patch(`/v1/api/auth/crm/clients/${ids.client._id}`)
      .set(asUser(ids.platformAdmin))
      .send({ status: "inactive" });
    expect(res.status).toBe(200);
  });

  test("client login is blocked", async () => {
    const res = await request(app).get("/v1/api/auth/crm/farmers").set(asUser(ids.clientViewer));
    expect(res.status).toBe(403);
  });

  test("the code no longer works for signup", async () => {
    const res = await request(app).get(
      `/v1/api/auth/biodrops/client-code/${ids.client.organizationCode}`,
    );
    expect(res.body.valid).toBe(false);
  });
});
