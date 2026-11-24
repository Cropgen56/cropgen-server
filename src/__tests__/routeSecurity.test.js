/**
 * Route-level security sweep. Mounts every real router exactly as index.js does,
 * then calls every route anonymously.
 *
 *  - no route may crash (5xx) when called with no credentials and an empty body
 *  - every route that is not on the PUBLIC allow-list must reject anonymous callers
 *
 * A new route that forgets its auth middleware fails this test until it is either
 * protected or deliberately added to PUBLIC_ROUTES.
 *
 * In-memory MongoDB only. SES / WhatsApp / axios / Google are mocked so nothing
 * is ever sent.
 */
import { jest } from "@jest/globals";
import express from "express";
import cookieParser from "cookie-parser";
import mongoose from "mongoose";
import request from "supertest";
import { MongoMemoryServer } from "mongodb-memory-server";

jest.setTimeout(30000);

process.env.JWT_ACCESS_SECRET = "test-access-secret";
process.env.JWT_REFRESH_SECRET = "test-refresh-secret";
process.env.NODE_ENV = "test";

const outbound = [];
const net = jest.fn(async (url) => {
  outbound.push(String(url));
  return { data: {} };
});
jest.unstable_mockModule("axios", () => ({
  default: { post: net, get: net, put: net, delete: net, patch: net, request: net, create: () => ({ post: net, get: net, put: net, delete: net }) },
}));
jest.unstable_mockModule("../config/sesClient.js", () => ({
  sendBasicEmail: jest.fn(async () => {}),
}));
jest.unstable_mockModule("razorpay", () => ({
  default: class { constructor() { this.orders = { create: jest.fn() }; this.payments = { fetch: jest.fn() }; } },
}));
jest.unstable_mockModule("google-auth-library", () => ({
  OAuth2Client: class { async verifyIdToken() { throw new Error("mocked"); } },
}));

let mongo;
let app;
const routes = [];

function mountPath(layer) {
  const m = layer.regexp?.source
    ?.replace("^\\/?(?=\\/|$)", "")
    ?.replace("\\/?(?=\\/|$)", "")
    ?.replace(/^\^/, "")
    ?.replace(/\\\//g, "/")
    ?.replace(/\$$/, "");
  return m && m !== "(?:)" ? m : "";
}

function collect(stack, prefix) {
  for (const layer of stack) {
    if (layer.route) {
      for (const method of Object.keys(layer.route.methods)) {
        if (layer.route.methods[method]) routes.push({ method: method.toUpperCase(), path: prefix + layer.route.path });
      }
    } else if (layer.name === "router" && layer.handle?.stack) {
      collect(layer.handle.stack, prefix + mountPath(layer));
    }
  }
}

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  process.env.MONGO_URI = mongo.getUri();
  await mongoose.connect(mongo.getUri());

  const imp = async (p) => (await import(p)).default;
  const mounts = [
    ["/v1/api/auth", "../routes/auth.routes.js"],
    ["/v1/api/field", "../routes/field.routes.js"],
    ["/v1/api/blog", "../routes/blog.routes.js"],
    ["/v1/api/org", "../routes/organization.routes.js"],
    ["/v1/api/operation", "../routes/operation.routes.js"],
    ["/v1/api/crop", "../routes/crop.routes.js"],
    ["/v1/api/email", "../routes/email.routes.js"],
    ["/v1/api/subscription", "../routes/subscription.routes.js"],
    ["/v1/api/subscription-plans", "../routes/subscriptionplan.routes.js"],
    ["/v1/api/biodrops/shop", "../clients/biodrops/routes/shop.routes.js"],
    ["/v1/api/posts", "../routes/post.routes.js"],
    ["/v1/api/common", "../routes/common.routes.js"],
    ["/v1/api/analytics", "../routes/analytics.routes.js"],
    ["/v1/api/whatsapp", "../routes/whatsapp.routes.js"],
    ["/v1/api/logs", "../routes/log.routes.js"],
    ["/v1/api/advisory", "../features/advisory/routes/advisory.routes.js"],
    ["/v1/api/carbon", "../routes/carbon.routes.js"],
    ["/v1/api/mandi", "../routes/mandi.routes.js"],
    ["/v1/api/soil-health", "../features/soil-health/soilHealth.routes.js"],
    ["/api/chats", "../routes/chat.routes.js"],
  ];

  app = express();
  app.use(express.json());
  app.use(cookieParser());
  for (const [base, file] of mounts) {
    const router = await imp(file);
    app.use(base, router);
    collect(router.stack, base);
  }
  app.use((req, res) => res.status(404).json({ message: "Route not found" }));
  app.use((err, req, res, _next) => res.status(err.status || 500).json({ error: String(err.message || err) }));
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});

const ID = "000000000000000000000000";
const fill = (p) => p.replace(/:[A-Za-z0-9_]+\??/g, ID).replace(/\(.*?\)/g, "").replace(/\*/g, "x");

test("route discovery found the API surface", () => {
  expect(routes.length).toBeGreaterThan(100);
});

// Routes that are public on purpose (sign-in/sign-up, catalogue, webhooks, contact forms).
const PUBLIC_ROUTES = [
  "GET /v1/api/auth/biodrops/client-code/:code",
  "GET /v1/api/auth/crm/invitations/accept/:token",
  "GET /v1/api/auth/organization-code/:code",
  "GET /v1/api/biodrops/shop/products",
  "GET /v1/api/biodrops/shop/products/:sku",
  "GET /v1/api/blog/",
  "GET /v1/api/blog/:id",
  "GET /v1/api/crop/get-crop-list",
  "GET /v1/api/crop/get/:id",
  "GET /v1/api/mandi/prices",
  "GET /v1/api/mandi/traded-crops",
  "GET /v1/api/subscription-plans/",
  "POST /v1/api/auth/admin-otp",
  "POST /v1/api/auth/biodrops/login/google",
  "POST /v1/api/auth/biodrops/login/google-mobile",
  "POST /v1/api/auth/biodrops/login/otp",
  "POST /v1/api/auth/biodrops/login/verify",
  "POST /v1/api/auth/biodrops/signup/otp",
  "POST /v1/api/auth/biodrops/signup/verify",
  "POST /v1/api/auth/biodrops/whatsapp/otp",
  "POST /v1/api/auth/biodrops/whatsapp/resend",
  "POST /v1/api/auth/biodrops/whatsapp/verify",
  "POST /v1/api/auth/crm/invitations/accept",
  "POST /v1/api/auth/crm/invitations/accept/:token",
  "POST /v1/api/auth/cropydeal-register-login",
  "POST /v1/api/auth/google",
  "POST /v1/api/auth/google-mobile",
  "POST /v1/api/auth/lfp/signup/check-user",
  "POST /v1/api/auth/lfp/whatsapp/otp",
  "POST /v1/api/auth/lfp/whatsapp/resend",
  "POST /v1/api/auth/lfp/whatsapp/verify",
  "POST /v1/api/auth/login/is-exist",
  "POST /v1/api/auth/login/mobile",
  "POST /v1/api/auth/logout",
  "POST /v1/api/auth/otp",
  "POST /v1/api/auth/resend-otp",
  "POST /v1/api/auth/send-otp",
  "POST /v1/api/auth/signup/check-user",
  "POST /v1/api/auth/signup/mobile",
  "POST /v1/api/auth/verify",
  "POST /v1/api/auth/verify-otp",
  "POST /v1/api/common/contact-us",
  "POST /v1/api/common/satagro/contact-us",
  "POST /v1/api/common/threedot/contact-us",
  "POST /v1/api/soil-health/report", // optionalAuthenticate + plan check by design
  "POST /v1/api/whatsapp/webhook", // Meta webhook
];

// Previously open and now fixed (kept here so a regression is named in the failure message):
//  - carbon.routes.js had no auth on any route (farms, farmers, organisations, totals)
//  - organization.routes.js POST /create had its auth lines commented out
const MUST_BE_PROTECTED = [
  "GET /v1/api/carbon/admin/farmers",
  "GET /v1/api/carbon/admin/farms",
  "GET /v1/api/carbon/admin/organizations",
  "GET /v1/api/carbon/admin/platform-total",
  "GET /v1/api/carbon/field/:farmFieldId/history",
  "GET /v1/api/carbon/profile/:userId",
  "POST /v1/api/org/create",
];

async function sweep() {
  const open = new Set();
  const crashed = [];
  const seen = new Set();
  const err = jest.spyOn(console, "error").mockImplementation(() => {});
  const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
  const log = jest.spyOn(console, "log").mockImplementation(() => {});
  for (const { method, path } of routes) {
    const key = `${method} ${path}`;
    if (seen.has(key)) continue;
    seen.add(key);
    try {
      const res = await request(app)[method.toLowerCase()](fill(path)).send(method === "GET" || method === "DELETE" ? undefined : {});
      if (res.status >= 500) crashed.push(`${key} -> ${res.status}`);
      if (![401, 403].includes(res.status)) open.add(key);
    } catch (e) {
      crashed.push(`${key} -> threw ${e.message}`);
    }
  }
  err.mockRestore(); warn.mockRestore(); log.mockRestore();
  return { open, crashed, total: seen.size };
}

describe("anonymous access sweep", () => {
  let result;
  beforeAll(async () => { result = await sweep(); });

  test("no route crashes (5xx) when called with no credentials and an empty body", () => {
    expect(result.crashed).toEqual([]);
  });

  test("no route sends an outbound request (email / WhatsApp / HTTP) for an anonymous empty call", () => {
    expect(outbound).toEqual([]);
  });

  test("only the documented routes are open to anonymous callers", () => {
    const allowed = new Set(PUBLIC_ROUTES);
    const unexpected = [...result.open].filter((r) => !allowed.has(r)).sort();
    // A route here means a protected route lost its auth, or a new public route was added without review.
    expect(unexpected).toEqual([]);
  });

  test("every allow-listed route still exists and is still open (keeps the lists honest)", () => {
    const stale = PUBLIC_ROUTES.filter((r) => !result.open.has(r)).sort();
    expect(stale).toEqual([]);
  });

  test("previously-open carbon and org-create routes now reject anonymous callers", () => {
    const routeKeys = new Set(routes.map((r) => `${r.method} ${r.path}`));
    for (const r of MUST_BE_PROTECTED) {
      expect(routeKeys.has(r)).toBe(true); // route still exists
      expect(result.open.has(r)).toBe(false); // and is no longer open
    }
  });

  test("most of the API is protected", () => {
    expect(result.total).toBeGreaterThan(200);
    expect(result.open.size / result.total).toBeLessThan(0.25);
  });
});

describe("carbon + organization-create authorization (regression for the fixed gaps)", () => {
  let jwt, User, Organization;
  let farmerTok, adminTok, devTok, clientTok;

  beforeAll(async () => {
    jwt = (await import("jsonwebtoken")).default;
    User = (await import("../models/user.model.js")).default;
    Organization = (await import("../models/organization.model.js")).default;
    const org = await Organization.collection.insertOne({ organizationCode: "CROPGEN", organizationName: "Cropgen" });
    const mk = async (role) => {
      const r = await User.collection.insertOne({ firstName: role, role, organization: org.insertedId, deletedAt: null });
      return jwt.sign({ id: String(r.insertedId) }, process.env.JWT_ACCESS_SECRET, { expiresIn: "1h" });
    };
    farmerTok = await mk("farmer");
    adminTok = await mk("admin");
    devTok = await mk("developer");
    clientTok = await mk("client");
  });

  const as = (tok) => ({ Authorization: `Bearer ${tok}` });
  const carbonGets = [
    "/v1/api/carbon/admin/farms",
    "/v1/api/carbon/admin/farmers",
    "/v1/api/carbon/admin/organizations",
    "/v1/api/carbon/admin/platform-total",
    `/v1/api/carbon/profile/${ID}`,
    `/v1/api/carbon/field/${ID}/history`,
  ];

  test.each(carbonGets)("GET %s: anonymous 401", async (url) => {
    expect((await request(app).get(url)).status).toBe(401);
  });

  test.each(carbonGets)("GET %s: a farmer is forbidden (403)", async (url) => {
    expect((await request(app).get(url).set(as(farmerTok))).status).toBe(403);
  });

  test.each(carbonGets)("GET %s: admin / developer / client can still use it (admin panel keeps working)", async (url) => {
    for (const tok of [adminTok, devTok, clientTok]) {
      const res = await request(app).get(url).set(as(tok));
      expect([401, 403]).not.toContain(res.status);
      expect(res.status).toBeLessThan(500);
    }
  });

  test("carbon: a forged token for a nonexistent user is rejected", async () => {
    const forged = jwt.sign({ id: ID }, process.env.JWT_ACCESS_SECRET, { expiresIn: "1h" });
    expect((await request(app).get("/v1/api/carbon/admin/farms").set(as(forged))).status).toBe(401);
  });

  test("org create: anonymous 401 and nothing is created", async () => {
    const before = await Organization.countDocuments();
    const res = await request(app).post("/v1/api/org/create").send({ organizationName: "Evil Corp", organizationCode: "EVIL" });
    expect(res.status).toBe(401);
    expect(await Organization.countDocuments()).toBe(before);
  });

  test("org create: a farmer is forbidden and nothing is created", async () => {
    const before = await Organization.countDocuments();
    const res = await request(app).post("/v1/api/org/create").set(as(farmerTok)).send({ organizationName: "Evil Corp", organizationCode: "EVIL" });
    expect(res.status).toBe(403);
    expect(await Organization.countDocuments()).toBe(before);
  });

  test("org create: a client-role user is forbidden (admin/developer only, like the other org routes)", async () => {
    const res = await request(app).post("/v1/api/org/create").set(as(clientTok)).send({ organizationName: "X", organizationCode: "XCLIENT" });
    expect(res.status).toBe(403);
  });

  test("org create: an admin can create an organization", async () => {
    const res = await request(app).post("/v1/api/org/create").set(as(adminTok)).send({ organizationName: "Good Org", organizationCode: "good1" });
    expect([200, 201]).toContain(res.status);
    expect(await Organization.findOne({ organizationCode: "GOOD1" })).not.toBeNull();
  });

  test("org create: admin still gets validation (400) and duplicate (409) errors", async () => {
    expect((await request(app).post("/v1/api/org/create").set(as(adminTok)).send({})).status).toBe(400);
    expect((await request(app).post("/v1/api/org/create").set(as(devTok)).send({ organizationName: "Dup", organizationCode: "GOOD1" })).status).toBe(409);
  });
});
