/**
 * GET /advisory/:farmFieldId?latest=true returns one advisory per ACTIVE crop
 * (no chips for deleted / retired crops or crop-less legacy advisories).
 * Runs against an in-memory MongoDB — never the database in .env.
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

let mongo;
let app;
let db;
let farmer;
let token;
const oid = () => new mongoose.Types.ObjectId();
const day = (n) => new Date(Date.UTC(2026, 9, n));

async function addField() {
  const _id = oid();
  await db.collection("farmfields").insertOne({
    _id,
    user: farmer._id,
    fieldName: "Field",
    cropName: "soybean",
    acre: 2,
    field: [],
  });
  return _id;
}

async function addCrop(farmField, cropName, isActive = true, cropRole = "main") {
  const _id = oid();
  await db.collection("fieldcrops").insertOne({
    _id,
    farmField,
    user: farmer._id,
    cropName,
    cropRole,
    cropLifecycleType: "seasonal",
    startDate: day(1),
    isActive,
  });
  return _id;
}

async function addAdvisory(farmFieldId, cropInstanceId, createdAt) {
  const _id = oid();
  await db.collection("farmadvisories").insertOne({
    _id,
    farmFieldId,
    cropInstanceId,
    activitiesToDo: [],
    createdAt,
    updatedAt: createdAt,
  });
  return _id;
}

async function latest(fieldId) {
  const res = await request(app)
    .get(`/advisory/${fieldId}?latest=true`)
    .set("Authorization", `Bearer ${token}`);
  expect(res.status).toBe(200);
  return res.body.advisories;
}

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  process.env.MONGO_URI = mongo.getUri();
  await mongoose.connect(mongo.getUri());
  db = mongoose.connection.db;

  const { default: User } = await import("../../../models/user.model.js");
  const { default: advisoryRoutes } = await import("../routes/advisory.routes.js");

  farmer = await User.create({ role: "farmer", terms: true, firstName: "F", phone: "+919000000500" });
  token = jwt.sign(
    { id: String(farmer._id), role: "farmer" },
    process.env.JWT_ACCESS_SECRET,
    { expiresIn: "1h" },
  );

  app = express();
  app.use(express.json());
  app.use("/advisory", advisoryRoutes);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});

test("only the active crop is returned, not deleted / retired / crop-less history", async () => {
  const field = await addField();
  const soybean = await addCrop(field, "soybean");
  const retired = await addCrop(field, "maize", false);
  const deletedCropId = oid();

  const current = await addAdvisory(field, soybean, day(28));
  await addAdvisory(field, soybean, day(20));
  await addAdvisory(field, retired, day(22));
  await addAdvisory(field, deletedCropId, day(27));
  await addAdvisory(field, null, day(13));

  const advisories = await latest(field);
  expect(advisories.map((a) => String(a._id))).toEqual([String(current)]);
  expect(advisories[0].cropInstanceId.cropName).toBe("soybean");
});

test("every active crop gets its own advisory", async () => {
  const field = await addField();
  const main = await addCrop(field, "tomato");
  const inter = await addCrop(field, "onion", true, "intercrop");
  await addAdvisory(field, main, day(10));
  await addAdvisory(field, inter, day(11));
  await addAdvisory(field, oid(), day(12));

  const names = (await latest(field)).map((a) => a.cropInstanceId.cropName).sort();
  expect(names).toEqual(["onion", "tomato"]);
});

test("a farm with no active crop shows only its single latest advisory", async () => {
  const field = await addField();
  await addAdvisory(field, null, day(5));
  const newest = await addAdvisory(field, oid(), day(9));
  await addAdvisory(field, oid(), day(7));

  const advisories = await latest(field);
  expect(advisories.map((a) => String(a._id))).toEqual([String(newest)]);
});
