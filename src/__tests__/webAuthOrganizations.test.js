/**
 * CropGen web and mobile app sign-up and login for CROPGEN and AAT
 * organization users (phone/WhatsApp, email OTP, Google). BioDrops accounts
 * stay blocked.
 * Runs against an in-memory MongoDB — never the database in .env. WhatsApp,
 * SES and Google are mocked, so no message is ever sent.
 */
import { jest } from "@jest/globals";
import express from "express";
import cookieParser from "cookie-parser";
import mongoose from "mongoose";
import request from "supertest";
import { MongoMemoryServer } from "mongodb-memory-server";

jest.setTimeout(120000);

process.env.JWT_ACCESS_SECRET = "test-access-secret";
process.env.JWT_REFRESH_SECRET = "test-refresh-secret";
process.env.GOOGLE_CLIENT_ID = "test-google-client";
process.env.NODE_ENV = "test";

// Last OTP "sent" per phone / email, captured from the mocked senders.
const sentOtps = {};

const axiosPost = jest.fn(async (url, body) => {
  if (String(url).includes("graph.facebook.com")) {
    sentOtps[`+${body.to}`] = body.template.components[0].parameters[0].text;
  }
  return { data: {} };
});
jest.unstable_mockModule("axios", () => ({
  default: { post: axiosPost, get: jest.fn(), create: () => ({ post: axiosPost, get: jest.fn() }) },
}));

jest.unstable_mockModule("../config/sesClient.js", () => ({
  sendBasicEmail: jest.fn(async ({ to, text }) => {
    const code = String(text || "").match(/code is (\d+)/)?.[1];
    if (code) sentOtps[to] = code;
  }),
}));

// Google token "g:<email>:<name>" verifies to that email.
jest.unstable_mockModule("google-auth-library", () => ({
  OAuth2Client: class {
    async verifyIdToken({ idToken }) {
      const [, email, name] = idToken.split(":");
      return { getPayload: () => ({ email, name }) };
    }
  },
}));

const WEB = { "X-Client-Brand": "cropgen", "X-Client-App": "cropgen_web" };
const web = (body) => ({ ...body, clientBrand: "cropgen" });

let mongo;
let app;
let User;
let Organization;
const orgs = {};

async function orgCodeOf(filter) {
  const user = await User.findOne(filter).populate("organization");
  return user?.organization?.organizationCode;
}

async function profileOrgCode(accessToken) {
  const res = await request(app)
    .get("/api/auth/profile")
    .set("Authorization", `Bearer ${accessToken}`);
  expect(res.status).toBe(200);
  const u = res.body.user || res.body.data?.user || res.body.data || res.body;
  return u.organization?.organizationCode || u.organizationCode;
}

async function phoneOtpLogin(phone) {
  // Skip the 60s resend cooldown left by the signup OTP earlier in this run.
  await User.updateOne({ phone }, { $set: { lastOtpSentAt: null } });
  const send = await request(app)
    .post("/api/auth/send-otp")
    .set(WEB)
    .send(web({ phone, signupIntent: false }));
  expect(send.status).toBe(200);
  return request(app)
    .post("/api/auth/verify-otp")
    .set(WEB)
    .send(web({ phone, otp: sentOtps[phone] }));
}

async function emailOtp(email, signupIntent) {
  await User.updateOne({ email }, { $set: { lastOtpSentAt: null } });
  const send = await request(app)
    .post("/api/auth/otp")
    .set(WEB)
    .send(web({ email, signupIntent }));
  expect(send.status).toBe(200);
  return request(app)
    .post("/api/auth/verify")
    .set(WEB)
    .send(web({ email, otp: sentOtps[email] }));
}

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  process.env.MONGO_URI = mongo.getUri();
  await mongoose.connect(mongo.getUri());

  ({ default: User } = await import("../models/user.model.js"));
  ({ default: Organization } = await import("../models/organization.model.js"));
  const { default: authRoutes } = await import("../routes/auth.routes.js");

  for (const [code, name] of [
    ["CROPGEN", "Cropgen pvt ltd"],
    ["AAT", "Agenbag's All Trade"],
    ["BIODROPS", "BioDrops"],
  ]) {
    const { insertedId } = await Organization.collection.insertOne({
      organizationCode: code,
      organizationName: name,
    });
    orgs[code] = insertedId;
  }

  app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use("/api/auth", authRoutes);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});

describe.each(["CROPGEN", "AAT"])("%s user on the CropGen web app", (code) => {
  const n = code === "AAT" ? "2" : "1";
  const phone = `+9190000000${n}0`;
  const email = `web-${code.toLowerCase()}@example.com`;
  const googleEmail = `google-${code.toLowerCase()}@example.com`;

  test("organization code is accepted on the signup form", async () => {
    const res = await request(app).get(`/api/auth/organization-code/${code.toLowerCase()}`);
    expect(res.status).toBe(200);
    expect(res.body.data.organizationCode).toBe(code);
  });

  test("phone signup creates the account in the chosen organization", async () => {
    const res = await request(app)
      .post("/api/auth/send-otp")
      .set(WEB)
      .send(
        web({
          phone,
          firstName: "Test",
          lastName: code,
          email: `phone-${code.toLowerCase()}@example.com`,
          country: "IN",
          language: "en",
          organizationCode: code,
          signupIntent: true,
        }),
      );
    expect(res.status).toBe(200);
    expect(await orgCodeOf({ phone })).toBe(code);

    const verify = await request(app)
      .post("/api/auth/verify-otp")
      .set(WEB)
      .send(web({ phone, otp: sentOtps[phone] }));
    expect(verify.status).toBe(200);
    expect(verify.body.onboardingRequired).toBe(false);
    expect(await profileOrgCode(verify.body.accessToken)).toBe(code);
  });

  test("phone login works for the existing account", async () => {
    const res = await phoneOtpLogin(phone);
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeTruthy();
    expect(await profileOrgCode(res.body.accessToken)).toBe(code);
  });

  test("phone signup again with the same number is told to log in", async () => {
    const res = await request(app)
      .post("/api/auth/send-otp")
      .set(WEB)
      .send(web({ phone, organizationCode: code, signupIntent: true, firstName: "X" }));
    expect(res.status).toBe(409);
    expect(res.body.message).toBe("User already exists. Please log in.");
  });

  test("email signup + complete profile puts the user in the chosen organization", async () => {
    const verify = await emailOtp(email, true);
    expect(verify.status).toBe(200);
    expect(verify.body.onboardingRequired).toBe(true);

    const complete = await request(app)
      .post("/api/auth/complete-profile")
      .set(WEB)
      .set("Authorization", `Bearer ${verify.body.accessToken}`)
      .send({
        terms: true,
        organizationCode: code,
        firstName: "Mail",
        lastName: code,
        email,
        phone: `+9190000000${n}1`,
        language: "en",
        country: "IN",
      });
    expect(complete.status).toBe(201);
    expect(await orgCodeOf({ email })).toBe(code);
  });

  test("email login works for the existing account", async () => {
    const res = await emailOtp(email, false);
    expect(res.status).toBe(200);
    expect(res.body.onboardingRequired).toBe(false);
    expect(res.body.user.organizationCode).toBe(code);
  });

  test("Google login keeps an existing account's organization", async () => {
    // Google signup always creates CROPGEN accounts, so seed the AAT user.
    await User.create({
      email: googleEmail,
      firstName: "Goo",
      lastName: code,
      role: "farmer",
      terms: true,
      country: "IN",
      phone: `+9190000000${n}2`,
      organization: orgs[code],
    });
    const res = await request(app)
      .post("/api/auth/google")
      .set(WEB)
      .send(web({ token: `g:${googleEmail}:Goo ${code}` }));
    expect(res.status).toBe(200);
    expect(res.body.onboardingRequired).toBe(false);
    expect(await orgCodeOf({ email: googleEmail })).toBe(code);
  });
});

test("new Google user picks AAT in the profile popup and stays AAT on next login", async () => {
  const email = "google-new-aat@example.com";
  const token = `g:${email}:New Farmer`;
  const first = await request(app).post("/api/auth/google").set(WEB).send(web({ token }));
  expect(first.status).toBe(200);
  expect(first.body.onboardingRequired).toBe(true);
  expect(await orgCodeOf({ email })).toBe("CROPGEN");

  // CompleteProfileGate submits the org code via update-user.
  const user = await User.findOne({ email });
  const update = await request(app)
    .patch(`/api/auth/update-user/${user._id}`)
    .set("Authorization", `Bearer ${first.body.accessToken}`)
    .send({
      firstName: "New",
      lastName: "Farmer",
      email,
      phone: "+919000000300",
      country: "IN",
      organizationCode: "AAT",
    });
  expect(update.status).toBe(200);
  expect(await orgCodeOf({ email })).toBe("AAT");

  const again = await request(app).post("/api/auth/google").set(WEB).send(web({ token }));
  expect(again.status).toBe(200);
  expect(await orgCodeOf({ email })).toBe("AAT");
});

describe("CropGen mobile app (no signupIntent, optional organization code)", () => {
  const APP = { "X-Client-App": "cropgen_android" };

  test.each([
    ["AAT", "AAT", "+919000000400"],
    ["", "CROPGEN", "+919000000401"],
  ])("new phone user with code '%s' joins %s and can log in", async (code, expected, phone) => {
    const send = await request(app)
      .post("/api/auth/send-otp")
      .set(APP)
      .send({ phone, language: "en", ...(code ? { organizationCode: code } : {}) });
    expect(send.status).toBe(200);
    expect(await orgCodeOf({ phone })).toBe(expected);

    const verify = await request(app)
      .post("/api/auth/verify-otp")
      .set(APP)
      .send({ phone, otp: sentOtps[phone] });
    expect(verify.status).toBe(200);
    expect(verify.body.data.accessToken).toBeTruthy();
  });

  test("existing AAT phone user logs in and stays AAT, whatever code is sent", async () => {
    const phone = "+919000000400";
    await User.updateOne({ phone }, { $set: { lastOtpSentAt: null } });
    const send = await request(app)
      .post("/api/auth/send-otp")
      .set(APP)
      .send({ phone, language: "en", organizationCode: "CROPGEN" });
    expect(send.status).toBe(200);
    expect(await orgCodeOf({ phone })).toBe("AAT");
  });

  test("new Google user with code AAT joins AAT; existing account keeps its org", async () => {
    const email = "mobile-google-aat@example.com";
    const token = `g:${email}:Mobile Farmer`;
    const first = await request(app)
      .post("/api/auth/google-mobile")
      .set(APP)
      .send({ token, organizationCode: "aat" });
    expect(first.status).toBe(200);
    expect(await orgCodeOf({ email })).toBe("AAT");

    const again = await request(app)
      .post("/api/auth/google-mobile")
      .set(APP)
      .send({ token, organizationCode: "CROPGEN" });
    expect(again.status).toBe(200);
    expect(await orgCodeOf({ email })).toBe("AAT");
  });

  test("new Google user without a code joins CROPGEN", async () => {
    const email = "mobile-google-cg@example.com";
    const res = await request(app)
      .post("/api/auth/google-mobile")
      .set(APP)
      .send({ token: `g:${email}:Mobile Farmer` });
    expect(res.status).toBe(200);
    expect(await orgCodeOf({ email })).toBe("CROPGEN");
  });

  test("Google code BIODROPS is ignored and an unknown code is rejected", async () => {
    const bio = "mobile-google-bio@example.com";
    const res = await request(app)
      .post("/api/auth/google-mobile")
      .set(APP)
      .send({ token: `g:${bio}:X Y`, organizationCode: "BIODROPS" });
    expect(res.status).toBe(200);
    expect(await orgCodeOf({ email: bio })).toBe("CROPGEN");

    const bad = "mobile-google-bad@example.com";
    const rejected = await request(app)
      .post("/api/auth/google-mobile")
      .set(APP)
      .send({ token: `g:${bad}:X Y`, organizationCode: "NOPE" });
    expect(rejected.status).toBe(404);
    expect(await User.findOne({ email: bad })).toBeNull();
  });

  test("existing AAT user is no longer signed out by the app's profile check", async () => {
    const phone = "+919000000400";
    await User.updateOne({ phone }, { $set: { lastOtpSentAt: null } });
    await request(app).post("/api/auth/send-otp").set(APP).send({ phone, language: "en" });
    const verify = await request(app)
      .post("/api/auth/verify-otp")
      .set(APP)
      .send({ phone, otp: sentOtps[phone] });
    expect(await profileOrgCode(verify.body.data.accessToken)).toBe("AAT");
  });
});

describe("blocked and invalid cases", () => {
  test("BioDrops phone account cannot log in on CropGen web", async () => {
    const phone = "+919000000900";
    await User.create({
      phone,
      firstName: "Bio",
      role: "farmer",
      terms: true,
      organization: orgs.BIODROPS,
    });
    const res = await request(app)
      .post("/api/auth/send-otp")
      .set(WEB)
      .send(web({ phone, signupIntent: false }));
    expect(res.status).toBe(404);
    expect(res.body.message).toMatch(/different CropGen platform/);
  });

  test("unknown phone gets the sign-up-first message", async () => {
    const res = await request(app)
      .post("/api/auth/send-otp")
      .set(WEB)
      .send(web({ phone: "+919000000999", signupIntent: false }));
    expect(res.status).toBe(404);
    expect(res.body.message).toBe("User does not exist. Please sign up first.");
  });

  test("unknown organization code is rejected at signup", async () => {
    const res = await request(app)
      .post("/api/auth/send-otp")
      .set(WEB)
      .send(
        web({ phone: "+919000000998", organizationCode: "NOPE", signupIntent: true, firstName: "X" }),
      );
    expect(res.status).toBe(404);
    expect(await User.findOne({ phone: "+919000000998" })).toBeNull();
  });
});
