/**
 * Auth middleware + auth utilities.
 * In-memory MongoDB only (never the database in .env). No network calls.
 */
import { jest } from "@jest/globals";
import express from "express";
import cookieParser from "cookie-parser";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import request from "supertest";
import { MongoMemoryServer } from "mongodb-memory-server";

jest.setTimeout(120000);

process.env.JWT_ACCESS_SECRET = "test-access-secret";
process.env.JWT_REFRESH_SECRET = "test-refresh-secret";
process.env.API_KEY = "test-api-key";
process.env.NODE_ENV = "test";

let mongo, app, User, Organization;
let mw, utils;
const ids = {};

const bearer = (token) => ({ Authorization: `Bearer ${token}` });
const token = (payload, secret = process.env.JWT_ACCESS_SECRET, opts = {}) =>
  jwt.sign(payload, secret, { expiresIn: "1h", ...opts });

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  process.env.MONGO_URI = mongo.getUri();
  await mongoose.connect(mongo.getUri());

  ({ default: User } = await import("../models/user.model.js"));
  ({ default: Organization } = await import("../models/organization.model.js"));
  mw = await import("../middleware/auth.middleware.js");
  utils = await import("../utils/auth/authUtils.js");

  const org = await Organization.collection.insertOne({ organizationCode: "CROPGEN", organizationName: "Cropgen" });
  const mk = async (name, extra) => {
    const r = await User.collection.insertOne({ firstName: name, role: "farmer", language: "hi", organization: org.insertedId, deletedAt: null, ...extra });
    return String(r.insertedId);
  };
  ids.farmer = await mk("Farmer", {});
  ids.admin = await mk("Admin", { role: "admin" });
  ids.deleted = await mk("Gone", { deletedAt: new Date() });

  app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.get("/private", mw.isAuthenticated, (req, res) => res.json({ user: req.user }));
  app.get("/optional", mw.optionalAuthenticate, (req, res) => res.json({ user: req.user || null }));
  app.get("/admin-only", mw.isAuthenticated, mw.authorizeRoles("admin", "developer"), (req, res) => res.json({ ok: true }));
  app.get("/panel", mw.isAuthenticated, mw.authorizeAdminOrOrgScoped, (req, res) => res.json({ ok: true }));
  app.get("/keyed", mw.checkApiKey, (req, res) => res.json({ ok: true }));
  app.get("/require", mw.requireAuth, (req, res) => res.json({ auth: req.auth }));
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});

describe("isAuthenticated", () => {
  test("no token -> 401", async () => {
    const res = await request(app).get("/private");
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ success: false, message: "Access denied. No token provided." });
  });

  test("garbage token -> 401", async () => {
    const res = await request(app).get("/private").set(bearer("not.a.jwt"));
    expect(res.status).toBe(401);
    expect(res.body.message).toBe("Invalid or expired token.");
  });

  test("token signed with the wrong secret -> 401", async () => {
    const res = await request(app).get("/private").set(bearer(token({ id: ids.farmer }, "other-secret")));
    expect(res.status).toBe(401);
  });

  test("expired token -> 401", async () => {
    const t = jwt.sign({ id: ids.farmer }, process.env.JWT_ACCESS_SECRET, { expiresIn: -10 });
    const res = await request(app).get("/private").set(bearer(t));
    expect(res.status).toBe(401);
  });

  test("a refresh token cannot be used as an access token", async () => {
    const refresh = utils.signRefreshToken({ id: ids.farmer }, "rid");
    const res = await request(app).get("/private").set(bearer(refresh));
    expect(res.status).toBe(401);
  });

  test("valid token for an active user -> 200 with role/language from the DB", async () => {
    // the token claims admin, but the database says farmer: the DB wins
    const res = await request(app).get("/private").set(bearer(token({ id: ids.farmer, role: "admin", language: "en" })));
    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe(ids.farmer);
    expect(res.body.user.role).toBe("farmer");
    expect(res.body.user.language).toBe("hi");
  });

  test("accepts _id as well as id in the token", async () => {
    const res = await request(app).get("/private").set(bearer(token({ _id: ids.farmer })));
    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe(ids.farmer);
  });

  test("soft-deleted user is rejected with USER_DELETED", async () => {
    const res = await request(app).get("/private").set(bearer(token({ id: ids.deleted })));
    expect(res.status).toBe(401);
    expect(res.body.code).toBe("USER_DELETED");
  });

  test("a token for a user that does not exist is rejected", async () => {
    const res = await request(app).get("/private").set(bearer(token({ id: new mongoose.Types.ObjectId().toString() })));
    expect(res.status).toBe(401);
    expect(res.body.code).toBe("USER_DELETED");
  });

  test("a valid token with no user id is rejected", async () => {
    const res = await request(app).get("/private").set(bearer(token({ foo: "bar" })));
    expect(res.status).toBe(401);
  });

  test("malformed Authorization header is treated as no usable token", async () => {
    const res = await request(app).get("/private").set("Authorization", "Bearer");
    expect(res.status).toBe(401);
  });
});

describe("optionalAuthenticate", () => {
  test("anonymous request continues without a user", async () => {
    const res = await request(app).get("/optional");
    expect(res.status).toBe(200);
    expect(res.body.user).toBeNull();
  });
  test("valid token attaches the user", async () => {
    const res = await request(app).get("/optional").set(bearer(token({ id: ids.farmer })));
    expect(res.body.user.id).toBe(ids.farmer);
  });
  test("invalid token is ignored (never an error)", async () => {
    const res = await request(app).get("/optional").set(bearer("junk"));
    expect(res.status).toBe(200);
    expect(res.body.user).toBeNull();
  });
  test("deleted user is treated as anonymous", async () => {
    const res = await request(app).get("/optional").set(bearer(token({ id: ids.deleted })));
    expect(res.status).toBe(200);
    expect(res.body.user).toBeNull();
  });
});

describe("authorizeRoles / authorizeAdminOrOrgScoped", () => {
  test("farmer is forbidden from an admin route", async () => {
    const res = await request(app).get("/admin-only").set(bearer(token({ id: ids.farmer })));
    expect(res.status).toBe(403);
  });
  test("admin is allowed", async () => {
    const res = await request(app).get("/admin-only").set(bearer(token({ id: ids.admin })));
    expect(res.status).toBe(200);
  });
  test("unauthenticated request never reaches the role check", async () => {
    expect((await request(app).get("/admin-only")).status).toBe(401);
  });
  test("admin panel gate: farmer 403, admin 200", async () => {
    expect((await request(app).get("/panel").set(bearer(token({ id: ids.farmer })))).status).toBe(403);
    expect((await request(app).get("/panel").set(bearer(token({ id: ids.admin })))).status).toBe(200);
  });
});

describe("checkApiKey", () => {
  test("missing or wrong key -> 401", async () => {
    expect((await request(app).get("/keyed")).status).toBe(401);
    expect((await request(app).get("/keyed").set("x-api-key", "nope")).status).toBe(401);
  });
  test("correct key -> 200", async () => {
    expect((await request(app).get("/keyed").set("x-api-key", "test-api-key")).status).toBe(200);
  });
});

describe("requireAuth", () => {
  test("nothing supplied -> 401 Unauthorized", async () => {
    const res = await request(app).get("/require");
    expect(res.status).toBe(401);
    expect(res.body.message).toBe("Unauthorized");
  });
  test("valid access token -> 200", async () => {
    const res = await request(app).get("/require").set(bearer(token({ id: ids.farmer })));
    expect(res.status).toBe(200);
    expect(res.body.auth.id).toBe(ids.farmer);
  });
  test("bad access token -> 401", async () => {
    const res = await request(app).get("/require").set(bearer("junk"));
    expect(res.status).toBe(401);
    expect(res.body.message).toBe("Invalid token");
  });
  test("falls back to the refresh cookie when there is no access token", async () => {
    const refresh = utils.signRefreshToken({ id: ids.farmer }, "rid1");
    const res = await request(app).get("/require").set("Cookie", [`refreshToken=${refresh}`]);
    expect(res.status).toBe(200);
  });
  test("deleted user via refresh cookie is rejected", async () => {
    const refresh = utils.signRefreshToken({ id: ids.deleted }, "rid2");
    const res = await request(app).get("/require").set("Cookie", [`refreshToken=${refresh}`]);
    expect(res.status).toBe(401);
    expect(res.body.code).toBe("USER_DELETED");
  });
});

describe("authUtils", () => {
  const req = (headers = {}, cookies = {}, body = {}) => ({ headers, cookies, body });

  test("resolveClientAppKey: header, satagro mapping, production origin, unknown", () => {
    expect(utils.resolveClientAppKey(req({ "x-client-app": "Admin" }))).toBe("admin");
    expect(utils.resolveClientAppKey(req({ "x-client-app": "satagro_android" }))).toBe("biodrops_web");
    expect(utils.resolveClientAppKey(req({ origin: "https://app.cropgenapp.com" }))).toBe("cropgen_web");
    expect(utils.resolveClientAppKey(req({ origin: "https://evil.example" }))).toBeNull();
    expect(utils.resolveClientAppKey(req({ "x-client-app": "bogus" }))).toBeNull();
    expect(utils.resolveClientAppKey(req())).toBeNull();
  });

  test("resolveClientSource", () => {
    expect(utils.resolveClientSource(req({ "x-client-app": "cropgen_android" }))).toBe("android");
    expect(utils.resolveClientSource(req({ "x-client-app": "cropgen_ios" }))).toBe("ios");
    expect(utils.resolveClientSource(req({ "x-client-app": "cropgen_web" }))).toBe("web");
    expect(utils.resolveClientSource(req())).toBe("android"); // legacy default
    expect(utils.resolveClientSource(req(), "ios")).toBe("ios");
  });

  test("refresh cookie name is per-app, legacy otherwise", () => {
    expect(utils.getRefreshCookieNameForRequest(req({ "x-client-app": "admin" }))).toBe("refreshToken_admin");
    expect(utils.getRefreshCookieNameForRequest(req())).toBe("refreshToken");
  });

  test("getRefreshTokenFromRequest prefers the app cookie, then legacy, then body", () => {
    const h = { "x-client-app": "admin" };
    expect(utils.getRefreshTokenFromRequest(req(h, { refreshToken_admin: "A", refreshToken: "L" }))).toBe("A");
    expect(utils.getRefreshTokenFromRequest(req(h, { refreshToken: "L" }))).toBe("L");
    expect(utils.getRefreshTokenFromRequest(req({}, {}, { refreshToken: "  B  " }))).toBe("B");
    expect(utils.getRefreshTokenFromRequest(req())).toBeNull();
  });

  test("access and refresh tokens use different secrets", () => {
    const access = utils.signAccessToken({ id: "1" });
    expect(() => jwt.verify(access, process.env.JWT_REFRESH_SECRET + "_r")).toThrow();
    const refresh = utils.signRefreshToken({ id: "1" }, "rid");
    expect(utils.verifyRefreshToken(refresh)).toMatchObject({ id: "1", rid: "rid" });
    expect(() => jwt.verify(refresh, process.env.JWT_ACCESS_SECRET)).toThrow();
  });

  test("verifyRefreshToken rejects empty and invalid tokens", () => {
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});
    expect(() => utils.verifyRefreshToken("")).toThrow("No token provided");
    expect(() => utils.verifyRefreshToken("junk")).toThrow();
    spy.mockRestore();
  });

  test("generateRefreshId is 64 hex chars and unique", () => {
    const a = utils.generateRefreshId();
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(utils.generateRefreshId()).not.toBe(a);
  });

  test("genOtp is always 6 digits", () => {
    for (let i = 0; i < 200; i++) expect(utils.genOtp()).toMatch(/^[1-9]\d{5}$/);
  });

  test("hash/compare round trip", async () => {
    const h = await utils.hash("123456");
    expect(h).not.toBe("123456");
    expect(await utils.compare("123456", h)).toBe(true);
    expect(await utils.compare("654321", h)).toBe(false);
  });

  test("client refresh id map helpers", () => {
    const user = { refreshTokenId: "legacy", refreshTokenIds: new Map([["admin", "A"]]) };
    expect(utils.getClientRefreshId(user, "admin")).toBe("A");
    expect(utils.getClientRefreshId(user, "cropgen_web")).toBe("legacy");
    expect(utils.getClientRefreshId(null, "admin")).toBeNull();
  });

  test("isDeletedUser / userDeletedPayload", () => {
    expect(utils.isDeletedUser({ deletedAt: new Date() })).toBe(true);
    expect(utils.isDeletedUser({ deletedAt: null })).toBe(false);
    expect(utils.isDeletedUser(null)).toBe(false);
    expect(utils.userDeletedPayload().code).toBe(utils.USER_DELETED_CODE);
  });

  test("findActiveAuthUser", async () => {
    expect(await utils.findActiveAuthUser(null)).toBeNull();
    expect(await utils.findActiveAuthUser(ids.deleted)).toBeNull();
    const u = await utils.findActiveAuthUser(ids.farmer);
    expect(u.role).toBe("farmer");
    expect(u.organization.organizationCode).toBe("CROPGEN");
  });
});
