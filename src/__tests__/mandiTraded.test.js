/**
 * Which catalog crops are traded in mandis: classification from stored prices
 * and saved checks, and the background resolver. Axios is mocked; MongoDB is
 * in-memory.
 */
import { jest } from "@jest/globals";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";

jest.setTimeout(120000);

const get = jest.fn();
jest.unstable_mockModule("axios", () => ({ default: { get } }));

const mandi = await import("../services/mandi.service.js");
const traded = await import("../services/mandiTraded.service.js");
const { default: Crop } = await import("../models/crop.model.js");
const { default: MandiPrice } = await import("../models/mandi-price.model.js");
const { default: MandiCommodityCheck } = await import("../models/mandi-commodity-check.model.js");
const { getTradedCrops } = await import("../controllers/mandi/mandi.controller.js");

let mongo;
beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
});
afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});
beforeEach(async () => {
  await Promise.all([Crop.deleteMany({}), MandiPrice.deleteMany({}), MandiCommodityCheck.deleteMany({})]);
  mandi.resetMandiState();
  traded.resetTradedState();
  get.mockReset();
});

const DAY = 86400000;
const fmt = (d) =>
  `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;
const today = () => mandi.todayIst();
// Crop has many required fields; the traded list only needs the name.
const addCrops = (...names) => Crop.collection.insertMany(names.map((cropName) => ({ cropName })));
const storePrice = (commodityKey, daysAgo = 0) =>
  MandiPrice.create({
    commodityKey, state: "K", district: "D", market: "M", variety: "V", grade: "G",
    arrivalDate: new Date(today().getTime() - daysAgo * DAY), data: { commodity: commodityKey },
  });
const rec = (commodity) => ({
  state: "K", district: "D", market: "M", commodity, variety: "V", grade: "G",
  arrival_date: fmt(today()), min_price: "1", max_price: "2", modal_price: "1",
});
// The feed answers per requested commodity name.
const feed = (byName) =>
  get.mockImplementation(async (_url, { params }) => ({
    data: { status: "ok", records: byName[params["filters[commodity]"]] ?? [] },
  }));
const check = (key) => MandiCommodityCheck.findOne({ commodityKey: key }).lean();

describe("classifyCrops (no upstream calls)", () => {
  test("stored prices make a crop traded; the alias name is what gets matched", async () => {
    await addCrops("amla", "wheat");
    await storePrice("amla(nelli kai)"); // alias of "amla"
    const r = await traded.classifyCrops();
    expect(r.traded).toEqual(["amla"]);
    expect(r.pendingCrops).toBe(1); // wheat never checked
    expect(get).not.toHaveBeenCalled();
  });

  test("a positive check counts even when no prices are stored", async () => {
    await addCrops("amla");
    await MandiCommodityCheck.create({ commodityKey: "amla(nelli kai)", hasData: true });
    expect((await traded.classifyCrops()).traded).toEqual(["amla"]);
  });

  test("a recent 'no prices' answer hides the crop and is not pending", async () => {
    await addCrops("almond");
    await MandiCommodityCheck.create({ commodityKey: "almond(badam)", hasData: false, checkedAt: new Date() });
    const r = await traded.classifyCrops();
    expect(r.traded).toEqual([]);
    expect(r.pendingCrops).toBe(0);
    expect(r.unknownNames).toEqual([]);
  });

  test("an old 'no prices' answer becomes unknown again and is re-checked", async () => {
    await addCrops("almond");
    await MandiCommodityCheck.create({
      commodityKey: "almond(badam)", hasData: false,
      checkedAt: new Date(Date.now() - traded.NEGATIVE_TTL_MS - DAY),
    });
    const r = await traded.classifyCrops();
    expect(r.pendingCrops).toBe(1);
    expect(r.unknownNames).toEqual(["Almond(Badam)"]);
  });

  test("a crop is traded if ANY of its names has data; unchecked names of a traded crop are not pending", async () => {
    await addCrops("chilli"); // aliases: Green Chilli, Dry Chillies
    await storePrice("dry chillies");
    const r = await traded.classifyCrops();
    expect(r.traded).toEqual(["chilli"]);
    expect(r.pendingCrops).toBe(0);
  });

  test("traded crops come back sorted by name", async () => {
    await addCrops("wheat", "amla");
    await MandiCommodityCheck.create({ commodityKey: "amla(nelli kai)", hasData: true });
    await MandiCommodityCheck.create({ commodityKey: "wheat", hasData: true });
    expect((await traded.classifyCrops()).traded).toEqual(["amla", "wheat"]);
  });
});

describe("background resolving", () => {
  test("checks unknown crops once, saves the answers, and the next call is complete", async () => {
    await addCrops("amla", "almond");
    feed({ "Amla(Nelli Kai)": [rec("Amla(Nelli Kai)")] }); // almond: nothing

    const first = await traded.getTradedCrops();
    expect(first.complete).toBe(false);
    expect(first.pending).toBe(2);

    await traded.waitForResolving();
    expect((await check("almond(badam)")).hasData).toBe(false);

    const second = await traded.getTradedCrops();
    expect(second).toEqual({ crops: ["amla"], complete: true, pending: 0 });

    const callsAfterResolve = get.mock.calls.length;
    await traded.getTradedCrops();
    expect(get.mock.calls.length).toBe(callsAfterResolve); // nothing re-checked
  });

  test("two calls at once start only one run", async () => {
    await addCrops("amla");
    feed({ "Amla(Nelli Kai)": [rec("Amla(Nelli Kai)")] });
    await Promise.all([traded.getTradedCrops(), traded.getTradedCrops()]);
    await traded.waitForResolving();
    const amlaCalls = get.mock.calls.filter(([, o]) => o.params["filters[commodity]"] === "Amla(Nelli Kai)");
    expect(amlaCalls.length).toBe(1);
  });

  test("a rate-limited feed stops the run quietly and leaves the rest unknown", async () => {
    await addCrops("almond", "amla");
    get.mockRejectedValue(Object.assign(new Error("slow down"), { response: { status: 429 } }));
    await traded.getTradedCrops();
    await traded.waitForResolving();
    const r = await traded.getTradedCrops();
    expect(r.complete).toBe(false);
    expect(r.crops).toEqual([]);
    expect(await MandiCommodityCheck.countDocuments()).toBe(0); // nothing wrongly marked "no"
  });

  test("a failing feed is NOT recorded as 'no prices'", async () => {
    await addCrops("amla");
    get.mockRejectedValue(Object.assign(new Error("boom"), { response: { status: 503 } }));
    await traded.getTradedCrops();
    await traded.waitForResolving();
    expect(await MandiCommodityCheck.countDocuments()).toBe(0);
    expect((await traded.getTradedCrops()).complete).toBe(false);
  });
});

describe("GET /v1/api/mandi/traded-crops", () => {
  const mockRes = () => {
    const res = { statusCode: 200 };
    res.status = (c) => ((res.statusCode = c), res);
    res.json = (b) => ((res.body = b), res);
    return res;
  };

  test("returns the traded crops with the completeness flag", async () => {
    await addCrops("amla");
    await MandiCommodityCheck.create({ commodityKey: "amla(nelli kai)", hasData: true });
    const res = mockRes();
    await getTradedCrops({}, res);
    expect(res.body).toEqual({ success: true, crops: ["amla"], complete: true, pending: 0 });
  });

  test("maps an unexpected failure to a 500 with a code", async () => {
    const spy = jest.spyOn(Crop, "find").mockImplementation(() => { throw new Error("db down"); });
    const res = mockRes();
    await getTradedCrops({}, res);
    spy.mockRestore();
    expect(res.statusCode).toBe(500);
    expect(res.body.code).toBe("MANDI_TRADED_UNAVAILABLE");
  });
});
