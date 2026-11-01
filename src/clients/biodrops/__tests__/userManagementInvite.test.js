/**
 * CRM user management + invitations, end to end: list/search/stats, the
 * invite form's account lookup, inviting new users, upgrading registered
 * farmers to staff, accepting the email link, edit, resend, suspend, remove.
 * Runs against an in-memory MongoDB with the invitation email mocked —
 * never the database or SES account in .env.
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

// Capture invitation emails (and their raw tokens) instead of sending them.
const sentInvites = [];
jest.unstable_mockModule("../services/crmInvitationEmail.service.js", () => ({
  sendCrmInvitationEmail: jest.fn(async (args) => {
    sentInvites.push(args);
  }),
  sendCrmLoginInstructionsEmail: jest.fn(async () => {}),
}));

let mongo;
let app;
let User;
let Organization;
let FarmField;
let Assignment;
let CrmInvitation;
let credits;
let biodrops;
const ids = {};

const tokenFor = (user) =>
  jwt.sign(
    { id: String(user._id), role: user.role, organization: String(user.organization) },
    process.env.JWT_ACCESS_SECRET,
    { expiresIn: "1h" },
  );
const asUser = (user) => ({ Authorization: `Bearer ${tokenFor(user)}` });
const api = (path) => `/v1/api/auth/crm${path}`;
const lastInvite = () => sentInvites[sentInvites.length - 1];

function invite(actor, body) {
  return request(app)
    .post(api("/invitations"))
    .set(asUser(actor))
    .send({
      countryCode: "IN",
      stateCode: "MH",
      districtCode: "PUNE",
      sendEmail: true,
      ...body,
    });
}

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  process.env.MONGO_URI = mongo.getUri();
  await mongoose.connect(mongo.getUri());

  ({ default: User } = await import("../../../models/user.model.js"));
  ({ default: Organization } = await import("../../../models/organization.model.js"));
  ({ default: FarmField } = await import("../../../models/field.model.js"));
  ({ default: Assignment } = await import("../models/admin-assignment.model.js"));
  ({ default: CrmInvitation } = await import("../models/crm-invitation.model.js"));
  credits = await import("../services/clientCredits.service.js");
  const { default: biodropsRoutes } = await import("../routes/index.js");

  app = express();
  app.use(express.json());
  app.use("/v1/api/auth", biodropsRoutes);

  biodrops = await Organization.create({ organizationName: "BioDrops", organizationCode: "BIODROPS" });
  ids.client = await Organization.create({
    organizationName: "Green Valley FPO",
    organizationCode: "BD-GREEN9",
    parentOrganization: biodrops._id,
    status: "active",
  });

  ids.superAdmin = await User.create({
    firstName: "Super",
    lastName: "Admin",
    email: "super@example.test",
    phone: "+919000000001",
    role: "staff",
    terms: true,
    organization: biodrops._id,
  });
  await Assignment.create({ userId: ids.superAdmin._id, level: "super", tenantId: biodrops._id });

  ids.districtOp = await User.create({
    firstName: "District",
    lastName: "Op",
    email: "district@example.test",
    phone: "+919000000002",
    role: "staff",
    terms: true,
    organization: biodrops._id,
  });
  await Assignment.create({
    userId: ids.districtOp._id,
    level: "district",
    tenantId: biodrops._id,
    countryCode: "IN",
    stateCode: "MH",
    districtCode: "NAGPUR",
  });

  const farmer = (attrs) =>
    User.create({ role: "farmer", terms: true, organization: biodrops._id, country: "IN", state: "MH", ...attrs });
  // Email stored mixed-case on purpose (real data has these).
  ids.farmer = await farmer({
    firstName: "Ravi",
    lastName: "Patil",
    email: "Ravi.Patil@Example.test",
    phone: "+919811111111",
    city: "Pune",
    village: "Shivne",
  });
  ids.clientFarmer = await farmer({
    firstName: "Asha",
    lastName: "More",
    email: "asha@example.test",
    phone: "+919822222222",
    clientOrganization: ids.client._id,
  });
  ids.otherFarmer = await farmer({ firstName: "Other", email: "other@example.test", phone: "+919833333333" });

  const { insertedId } = await FarmField.collection.insertOne({
    user: ids.farmer._id,
    fieldName: "Ravi's plot",
    acre: 3,
    field: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  ids.farmerField = insertedId;
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});

describe("team list", () => {
  test("list, stats, hierarchy, manager picker and pending all load", async () => {
    for (const path of [
      "/user-management",
      "/user-management/stats",
      "/user-management/hierarchy",
      "/user-management/admins?forLevel=district",
      "/user-management/pending",
    ]) {
      const res = await request(app).get(api(path)).set(asUser(ids.superAdmin));
      expect([path, res.status]).toEqual([path, 200]);
    }
  });

  test("search matches full name in any order, role, and region", async () => {
    const names = async (q) =>
      (await request(app).get(api(`/user-management?search=${encodeURIComponent(q)}`)).set(asUser(ids.superAdmin)))
        .body.users.map((u) => u.name);
    expect(await names("admin super")).toEqual(["Super Admin"]);
    expect(await names("district op")).toEqual(["District Op"]);
    expect(await names("9000000002")).toEqual(["District Op"]);
    expect(await names("nobody-here")).toEqual([]);
  });
});

describe("invite form lookup (check-user)", () => {
  const check = (q) =>
    request(app).get(api(`/invitations/check-user?${new URLSearchParams(q)}`)).set(asUser(ids.superAdmin));

  test("a new email/phone can be invited as a new user", async () => {
    const res = await check({ email: "brand.new@example.test", phone: "+919844444444" });
    expect(res.body).toMatchObject({ canInvite: true, status: "new" });
  });

  test("a registered farmer is found by email in any case, or by bare 10-digit phone, with details to prefill", async () => {
    for (const q of [{ email: "RAVI.PATIL@EXAMPLE.TEST" }, { phone: "9811111111" }]) {
      const res = await check(q);
      expect(res.body).toMatchObject({ canInvite: true, status: "existing" });
      expect(res.body.existingUser).toMatchObject({
        id: String(ids.farmer._id),
        name: "Ravi Patil",
        isFarmer: true,
        phone: "+919811111111",
        state: "MH",
        city: "Pune",
        village: "Shivne",
      });
    }
  });

  test("email and phone of two different accounts is a conflict", async () => {
    const res = await check({ email: "ravi.patil@example.test", phone: "+919833333333" });
    expect(res.body).toMatchObject({ canInvite: false, status: "account_conflict" });
  });

  test("an existing CRM member cannot be invited again", async () => {
    const res = await check({ email: "district@example.test" });
    expect(res.body).toMatchObject({ canInvite: false, status: "already_crm" });
  });
});

describe("inviting a brand-new user", () => {
  test("creates a staff account, assignment and pending email invitation", async () => {
    const res = await invite(ids.superAdmin, {
      fullName: "Neha Kulkarni",
      email: "Neha@Example.test",
      phone: "9855555555",
      level: "district",
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ emailSent: true });
    expect(res.body.invitation).toMatchObject({ existingAccount: false, upgradedFromFarmer: false });

    const user = await User.findById(res.body.invitation.userId).lean();
    expect(user).toMatchObject({
      firstName: "Neha",
      lastName: "Kulkarni",
      email: "neha@example.test",
      phone: "+919855555555",
      role: "staff",
      district: "PUNE",
    });
    expect(await Assignment.exists({ userId: user._id, level: "district", status: "active" })).toBeTruthy();
    expect(lastInvite()).toMatchObject({ to: "neha@example.test", roleLevel: "district" });
    ids.neha = user;

    const list = await request(app).get(api("/user-management?status=pending")).set(asUser(ids.superAdmin));
    expect(list.body.users.map((u) => u.name)).toContain("Neha Kulkarni");
  });

  test("the email link verifies the invitation", async () => {
    const { token } = lastInvite();
    const view = await request(app).get(api(`/invitations/accept/${token}`));
    expect(view.status).toBe(200);

    const noTerms = await request(app).post(api(`/invitations/accept/${token}`)).send({});
    expect(noTerms.status).toBe(400);

    const ok = await request(app).post(api(`/invitations/accept/${token}`)).send({ acceptTerms: true });
    expect(ok.status).toBe(200);
    const inv = await CrmInvitation.findOne({ userId: ids.neha._id }).lean();
    expect(inv.status).toBe("accepted");

    const again = await request(app).post(api(`/invitations/accept/${token}`)).send({ acceptTerms: true });
    expect(again.body.alreadyAccepted).toBe(true);
  });

  test("required fields and a bad token are rejected", async () => {
    expect((await invite(ids.superAdmin, { email: "x@example.test", phone: "9866666666", level: "district" })).status).toBe(400);
    expect((await invite(ids.superAdmin, { fullName: "No Phone", email: "np@example.test", level: "district" })).status).toBe(400);
    expect((await request(app).get(api("/invitations/accept/not-a-real-token"))).status).toBe(404);
  });

  test("only one admin per state: a second state admin for MH is refused", async () => {
    const first = await invite(ids.superAdmin, {
      fullName: "State One",
      email: "state1@example.test",
      phone: "9877777771",
      level: "state",
      sendEmail: false,
    });
    expect(first.status).toBe(201);
    const second = await invite(ids.superAdmin, {
      fullName: "State Two",
      email: "state2@example.test",
      phone: "9877777772",
      level: "state",
      sendEmail: false,
    });
    expect(second.status).toBe(409);
    // The refused invite must not leave an orphan account behind.
    expect(await User.exists({ email: "state2@example.test" })).toBeNull();
  });
});

describe("upgrading a registered farmer to staff", () => {
  test("a refused invite (no permission) leaves the farmer untouched", async () => {
    // A district operator cannot create a state-level admin.
    const res = await invite(ids.districtOp, {
      fullName: "Changed Name",
      email: "ravi.patil@example.test",
      phone: "9811111111",
      level: "state",
      stateCode: "GJ",
    });
    expect(res.status).toBe(403);
    const after = await User.findById(ids.farmer._id).lean();
    expect(after).toMatchObject({ role: "farmer", firstName: "Ravi" });
    expect(after.upgradedFromFarmer).not.toBe(true);
  });

  test("the same account becomes CRM staff and keeps its farms", async () => {
    const res = await invite(ids.superAdmin, {
      fullName: "Ravi Patil",
      email: "ravi.patil@example.test",
      phone: "9811111111",
      level: "ground",
      sendEmail: false,
    });
    expect(res.status).toBe(201);
    expect(res.body.invitation).toMatchObject({
      userId: String(ids.farmer._id),
      existingAccount: true,
      upgradedFromFarmer: true,
    });
    const user = await User.findById(ids.farmer._id).lean();
    expect(user).toMatchObject({ role: "staff", upgradedFromFarmer: true });
    expect(await FarmField.exists({ _id: ids.farmerField, user: ids.farmer._id })).toBeTruthy();

    const list = await request(app).get(api("/user-management?search=ravi")).set(asUser(ids.superAdmin));
    expect(list.body.users.map((u) => u.id)).toEqual([String(ids.farmer._id)]);
  });

  test("an upgraded client farmer keeps client credits", async () => {
    const res = await invite(ids.superAdmin, {
      fullName: "Asha More",
      email: "asha@example.test",
      phone: "9822222222",
      level: "ground",
      sendEmail: false,
    });
    expect(res.status).toBe(201);
    const user = await User.findById(ids.clientFarmer._id).lean();
    expect(await credits.getClientActivationNotice(user)).toMatchObject({ required: true });
  });
});

describe("editing, resending, suspending and removing", () => {
  test("edit updates name and phone; another account's email (any case) is refused", async () => {
    const ok = await request(app)
      .patch(api(`/user-management/${ids.neha._id}`))
      .set(asUser(ids.superAdmin))
      .send({ fullName: "Neha K", phone: "9855555500" });
    expect(ok.status).toBe(200);
    expect(ok.body.user).toMatchObject({ name: "Neha K", phone: "+919855555500" });

    // otherFarmer is stored lowercase; Ravi's original was mixed-case.
    const dup = await request(app)
      .patch(api(`/user-management/${ids.neha._id}`))
      .set(asUser(ids.superAdmin))
      .send({ email: "OTHER@example.test" });
    expect(dup.status).toBe(409);
  });

  test("resend goes to the user's current email, not the one first invited", async () => {
    const pending = await invite(ids.superAdmin, {
      fullName: "Resend Me",
      email: "old.address@example.test",
      phone: "9888888888",
      level: "ground",
    });
    expect(pending.status).toBe(201);
    const userId = pending.body.invitation.userId;

    await request(app)
      .patch(api(`/user-management/${userId}`))
      .set(asUser(ids.superAdmin))
      .send({ email: "new.address@example.test" })
      .expect(200);

    const res = await request(app).post(api(`/invitations/resend/${userId}`)).set(asUser(ids.superAdmin));
    expect(res.status).toBe(200);
    expect(lastInvite().to).toBe("new.address@example.test");
    // The new link works.
    const ok = await request(app)
      .post(api(`/invitations/accept/${lastInvite().token}`))
      .send({ acceptTerms: true });
    expect(ok.status).toBe(200);
  });

  test("resend for a user invited without email explains why", async () => {
    const res = await request(app)
      .post(api(`/invitations/resend/${ids.farmer._id}`))
      .set(asUser(ids.superAdmin));
    expect(res.status).toBe(404);
    expect(res.body.message).toMatch(/no pending invitation/i);
  });

  test("a district operator cannot manage a super admin", async () => {
    const res = await request(app)
      .patch(api(`/user-management/${ids.superAdmin._id}`))
      .set(asUser(ids.districtOp))
      .send({ fullName: "Hacked" });
    // Out-of-scope users are hidden (404) or refused (403) — never changed.
    expect([403, 404]).toContain(res.status);
    expect((await User.findById(ids.superAdmin._id).lean()).firstName).toBe("Super");
  });

  test("a super admin cannot suspend themselves", async () => {
    const a = await Assignment.findOne({ userId: ids.superAdmin._id, level: "super" });
    const res = await request(app)
      .patch(api(`/user-management/assignments/${a._id}/suspend`))
      .set(asUser(ids.superAdmin));
    expect(res.status).toBe(403);
    expect((await Assignment.findById(a._id).lean()).status).toBe("active");
  });

  test("suspending the last super admin is refused with a clear message", async () => {
    const platformAdmin = await User.create({
      email: "platform@example.test",
      role: "admin",
      terms: true,
      organization: biodrops._id,
    });
    const a = await Assignment.findOne({ userId: ids.superAdmin._id, level: "super" });
    const res = await request(app)
      .patch(api(`/user-management/assignments/${a._id}/suspend`))
      .set(asUser(platformAdmin));
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/super admin/i);
    expect((await Assignment.findById(a._id).lean()).status).toBe("active");
  });

  test("suspending a member shows them as disabled", async () => {
    const a = await Assignment.findOne({ userId: ids.neha._id });
    const res = await request(app)
      .patch(api(`/user-management/assignments/${a._id}/suspend`))
      .set(asUser(ids.superAdmin));
    expect(res.status).toBe(200);
    const list = await request(app).get(api("/user-management?status=disabled")).set(asUser(ids.superAdmin));
    expect(list.body.users.map((u) => u.name)).toContain("Neha K");
  });

  test("removing an upgraded farmer from the team makes them a farmer again", async () => {
    const res = await request(app)
      .delete(api(`/user-management/${ids.farmer._id}`))
      .set(asUser(ids.superAdmin));
    expect(res.status).toBe(200);
    const user = await User.findById(ids.farmer._id).lean();
    expect(user).toMatchObject({ role: "farmer" });
    expect(user.upgradedFromFarmer).not.toBe(true);
    expect(await Assignment.exists({ userId: ids.farmer._id })).toBeNull();
    expect(await FarmField.exists({ _id: ids.farmerField, user: ids.farmer._id })).toBeTruthy();

    // ...and can be invited again later.
    const check = await request(app)
      .get(api("/invitations/check-user?phone=9811111111"))
      .set(asUser(ids.superAdmin));
    expect(check.body).toMatchObject({ canInvite: true, status: "existing" });
  });
});

describe("follow-ups from the UI review", () => {
  test("nobody is offered management of their own record", async () => {
    const list = await request(app).get(api("/user-management")).set(asUser(ids.superAdmin));
    const self = list.body.users.find((u) => u.id === String(ids.superAdmin._id));
    expect(self.canManage).toBe(false);
    const other = list.body.users.find((u) => u.id === String(ids.districtOp._id));
    expect(other.canManage).toBe(true);

    const detail = await request(app)
      .get(api(`/user-management/${ids.superAdmin._id}`))
      .set(asUser(ids.superAdmin));
    expect(detail.body.user.canManage).toBe(false);
  });

  test("expired invitations stay on the pending list, flagged, and can be resent", async () => {
    const res = await invite(ids.superAdmin, {
      fullName: "Late Joiner",
      email: "late@example.test",
      phone: "9899999999",
      level: "ground",
    });
    const userId = res.body.invitation.userId;
    await CrmInvitation.updateOne({ userId }, { expiresAt: new Date(Date.now() - 1000) });

    const pending = await request(app).get(api("/user-management/pending")).set(asUser(ids.superAdmin));
    expect(pending.body.users.find((u) => u.id === userId)).toMatchObject({ expired: true });

    expect(
      (await request(app).post(api(`/invitations/resend/${userId}`)).set(asUser(ids.superAdmin))).status,
    ).toBe(200);
    const after = await request(app).get(api("/user-management/pending")).set(asUser(ids.superAdmin));
    expect(after.body.users.find((u) => u.id === userId)).toMatchObject({ expired: false });
  });

  test("a suspended member can be reactivated", async () => {
    const res = await request(app)
      .patch(api(`/user-management/${ids.neha._id}`))
      .set(asUser(ids.superAdmin))
      .send({ assignmentStatus: "active" });
    expect(res.status).toBe(200);
    expect(res.body.user.assignmentStatus).toBe("active");
  });
});

describe("pending badge matches the Pending Invitations page", () => {
  const counts = async () => {
    const [stats, pending] = await Promise.all([
      request(app).get(api("/user-management/stats")).set(asUser(ids.superAdmin)),
      request(app).get(api("/user-management/pending")).set(asUser(ids.superAdmin)),
    ]);
    return [stats.body.stats.pendingInvitations, pending.body.users.length];
  };

  test("the counts agree, and removing someone with an expired invite drops them from both", async () => {
    const [badge, page] = await counts();
    expect(badge).toBe(page);
    expect(page).toBeGreaterThan(0);

    const res = await invite(ids.superAdmin, {
      fullName: "Gone Soon",
      email: "gone@example.test",
      phone: "9811100000",
      level: "ground",
    });
    const userId = res.body.invitation.userId;
    await CrmInvitation.updateOne({ userId }, { status: "expired" });
    expect(await counts()).toEqual([page + 1, page + 1]);

    await request(app).delete(api(`/user-management/${userId}`)).set(asUser(ids.superAdmin)).expect(200);
    expect(await counts()).toEqual([page, page]);
  });
});

test("someone who already signs in is not listed as pending, even with an open invite", async () => {
  const res = await invite(ids.superAdmin, {
    fullName: "Logs In Anyway",
    email: "loggedin@example.test",
    phone: "9811122222",
    level: "ground",
  });
  const userId = res.body.invitation.userId;
  const listed = async () =>
    (await request(app).get(api("/user-management/pending")).set(asUser(ids.superAdmin))).body.users.some(
      (u) => u.id === userId,
    );
  expect(await listed()).toBe(true);
  await User.updateOne({ _id: userId }, { lastLoginAt: new Date() });
  expect(await listed()).toBe(false);
});

describe("client login accounts can never become CRM staff", () => {
  let clientLogin;
  beforeAll(async () => {
    // A client's own CRM login: staff + clientOrganization, no assignment.
    clientLogin = await User.create({
      firstName: "Vishal",
      lastName: "Pillai",
      email: "client.login@example.test",
      phone: "+918709706576",
      role: "staff",
      terms: true,
      organization: biodrops._id,
      clientOrganization: ids.client._id,
    });
  });

  test("the invite lookup refuses it and names the client", async () => {
    for (const q of [{ email: "CLIENT.LOGIN@example.test" }, { phone: "8709706576" }]) {
      const res = await request(app)
        .get(api(`/invitations/check-user?${new URLSearchParams(q)}`))
        .set(asUser(ids.superAdmin));
      expect(res.body).toMatchObject({ canInvite: false, status: "client_account" });
      expect(res.body.message).toMatch(/Green Valley FPO/);
      expect(res.body.existingUser).toBeUndefined();
    }
  });

  test("sending the invite anyway is refused and changes nothing", async () => {
    const res = await invite(ids.superAdmin, {
      fullName: "vishal",
      email: "client.login@example.test",
      phone: "8709706576",
      level: "ground",
      sendEmail: false,
    });
    expect(res.status).toBe(409);
    expect(await Assignment.exists({ userId: clientLogin._id })).toBeNull();
    expect(await User.findById(clientLogin._id).lean()).toMatchObject({
      firstName: "Vishal",
      role: "staff",
      clientOrganization: ids.client._id,
    });
  });

  test("the direct admin-assignment endpoint refuses it too", async () => {
    const res = await request(app)
      .post("/v1/api/auth/admin-assignments")
      .set(asUser(ids.superAdmin))
      .send({ userId: String(clientLogin._id), level: "ground", countryCode: "IN", stateCode: "MH", districtCode: "PUNE" });
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/client/i);
    expect(await Assignment.exists({ userId: clientLogin._id })).toBeNull();
  });

  test("an upgraded client farmer is still invitable (not a client login)", async () => {
    expect(
      (await import("../utils/clientOrg.js")).isClientLoginAccount({
        role: "staff",
        upgradedFromFarmer: true,
        clientOrganization: ids.client._id,
      }),
    ).toBe(false);
  });
});
