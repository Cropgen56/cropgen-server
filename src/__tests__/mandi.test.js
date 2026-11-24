/**
 * Mandi prices: loaded from data.gov.in, stored in MongoDB, shown for one day
 * (today's, else the latest stored day). Axios is mocked; MongoDB is in-memory.
 */
import { jest } from "@jest/globals";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";

jest.setTimeout(120000);

const get = jest.fn();
jest.unstable_mockModule("axios", () => ({ default: { get } }));

const svc = await import("../services/mandi.service.js");
const { default: MandiPrice } = await import("../models/mandi-price.model.js");
const { getMandiPrices } = await import("../controllers/mandi/mandi.controller.js");

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
  await MandiPrice.deleteMany({});
  svc.resetMandiState();
  get.mockReset();
});

const DAY = 86400000;
const fmt = (d) =>
  `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;
const today = () => svc.todayIst();
const daysAgo = (n) => new Date(today().getTime() - n * DAY);
const rec = (market, date, extra = {}) => ({
  state: "Kerala", district: "Ernakulam", market, commodity: "Tomato", variety: "Local", grade: "FAQ",
  arrival_date: fmt(date), min_price: "1000", max_price: "2000", modal_price: "1500", ...extra,
});
const ok = (records) => ({ data: { status: "ok", records } });
const upstreamError = (status) => Object.assign(new Error("boom"), { response: status ? { status } : undefined });
const mockRes = () => {
  const res = { statusCode: 200 };
  res.status = (c) => ((res.statusCode = c), res);
  res.json = (b) => ((res.body = b), res);
  return res;
};

describe("dates", () => {
  test("parseArrivalDate reads dd/mm/yyyy and rejects junk", () => {
    expect(svc.parseArrivalDate("12/11/2026").toISOString()).toBe("2026-11-12T00:00:00.000Z");
    expect(svc.parseArrivalDate("1-2-2026").toISOString()).toBe("2026-02-01T00:00:00.000Z");
    expect(svc.parseArrivalDate("31/02/2026")).toBeNull();
    expect(svc.parseArrivalDate("")).toBeNull();
    expect(svc.parseArrivalDate("2026-11-12")).toBeNull();
  });

  test("todayIst rolls over at 00:00 India time (18:30 UTC)", () => {
    const before = Date.UTC(2026, 10, 12, 18, 29);
    const after = Date.UTC(2026, 10, 12, 18, 31);
    expect(svc.todayIst(before).toISOString().slice(0, 10)).toBe("2026-11-12");
    expect(svc.todayIst(after).toISOString().slice(0, 10)).toBe("2026-11-13");
  });
});

describe("loading from data.gov.in into the database", () => {
  test("loads directly, stores every record, and returns today's prices", async () => {
    get.mockResolvedValue(ok([rec("Aluva", today()), rec("Kochi", today())]));
    const r = await svc.getMandiRecords("Tomato");
    expect(r).toMatchObject({ isToday: true, source: "live", date: today().toISOString().slice(0, 10) });
    expect(r.records).toHaveLength(2);
    expect(await MandiPrice.countDocuments({ commodityKey: "tomato" })).toBe(2);
    expect(get.mock.calls[0][1].params["filters[commodity]"]).toBe("Tomato");
  });

  test("re-fetching updates the same row instead of duplicating it", async () => {
    get.mockResolvedValue(ok([rec("Aluva", today(), { modal_price: "1500" })]));
    await svc.getMandiRecords("Tomato");
    svc.resetMandiState();
    get.mockResolvedValue(ok([rec("Aluva", today(), { modal_price: "1800" })]));
    const r = await svc.getMandiRecords("Tomato");
    expect(await MandiPrice.countDocuments({})).toBe(1);
    expect(r.records[0].modal_price).toBe("1800");
  });

  test("a commodity is refreshed at most once per window; the rest come from the database", async () => {
    get.mockResolvedValue(ok([rec("Aluva", today())]));
    await svc.getMandiRecords("Tomato");
    const again = await svc.getMandiRecords("tomato ");
    expect(get).toHaveBeenCalledTimes(1);
    expect(again).toMatchObject({ source: "database", isToday: true });
    await svc.getMandiRecords("Tomato", Date.now() + svc.REFRESH_MS + 1000);
    expect(get).toHaveBeenCalledTimes(2);
  });

  test("simultaneous requests share one upstream call", async () => {
    let release;
    get.mockImplementation(() => new Promise((r) => (release = () => r(ok([rec("Aluva", today())])))));
    const all = [svc.getMandiRecords("Onion"), svc.getMandiRecords("Onion"), svc.getMandiRecords("Onion")];
    await new Promise((r) => setTimeout(r, 10));
    release();
    const results = await Promise.all(all);
    expect(get).toHaveBeenCalledTimes(1);
    results.forEach((r) => expect(r.records).toHaveLength(1));
  });

  test("'No query was recieved' answers are retried and not stored as empty", async () => {
    get
      .mockResolvedValueOnce({ data: { message: "No query was recieved", records: [] } })
      .mockResolvedValueOnce(ok([rec("Aluva", today())]));
    const r = await svc.getMandiRecords("Soybean");
    expect(r.records).toHaveLength(1);
    expect(get).toHaveBeenCalledTimes(2);
  });
});

describe("one day only: today's, else the latest stored day", () => {
  test("when today's prices are not available, yesterday's stored prices are shown", async () => {
    // yesterday was stored earlier; today's call returns only yesterday's data
    await MandiPrice.create({
      commodityKey: "tomato", state: "Kerala", district: "Ernakulam", market: "Aluva", variety: "Local", grade: "FAQ",
      arrivalDate: daysAgo(1), data: rec("Aluva", daysAgo(1)),
    });
    get.mockResolvedValue(ok([rec("Kochi", daysAgo(1))]));
    const r = await svc.getMandiRecords("Tomato");
    expect(r.isToday).toBe(false);
    expect(r.date).toBe(daysAgo(1).toISOString().slice(0, 10));
    expect(r.records.map((x) => x.market).sort()).toEqual(["Aluva", "Kochi"]);
  });

  test("never mixes days: once today's prices exist only they are returned", async () => {
    await MandiPrice.create({
      commodityKey: "tomato", state: "K", district: "E", market: "Old", variety: "L", grade: "F",
      arrivalDate: daysAgo(1), data: rec("Old", daysAgo(1)),
    });
    get.mockResolvedValue(ok([rec("Aluva", today())]));
    const r = await svc.getMandiRecords("Tomato");
    expect(r.isToday).toBe(true);
    expect(r.records.map((x) => x.market)).toEqual(["Aluva"]);
  });

  test("future-dated rows are ignored", async () => {
    await MandiPrice.create({
      commodityKey: "tomato", state: "K", district: "E", market: "Future", variety: "L", grade: "F",
      arrivalDate: new Date(today().getTime() + 3 * DAY), data: rec("Future", today()),
    });
    get.mockResolvedValue(ok([]));
    const r = await svc.getMandiRecords("Tomato");
    expect(r.records).toEqual([]);
    expect(r.date).toBeNull();
  });

  test("a crop always shows its last available rates, however old", async () => {
    // Last reported 40 days ago — previously hidden after 7 days.
    await MandiPrice.create({
      commodityKey: "tomato", state: "K", district: "E", market: "Aluva", variety: "L", grade: "F",
      arrivalDate: daysAgo(40), data: rec("Aluva", daysAgo(40)),
    });
    get.mockResolvedValue(ok([]));
    const r = await svc.getMandiRecords("Tomato");
    expect(r.isToday).toBe(false);
    expect(r.date).toBe(daysAgo(40).toISOString().slice(0, 10));
    expect(r.records.map((x) => x.market)).toEqual(["Aluva"]);
  });

  test("shows the most recent stored day, not an older busier one", async () => {
    await MandiPrice.create({
      commodityKey: "tomato", state: "K", district: "E", market: "OldA", variety: "L", grade: "F",
      arrivalDate: daysAgo(60), data: rec("OldA", daysAgo(60)),
    });
    await MandiPrice.create({
      commodityKey: "tomato", state: "K", district: "E", market: "OldB", variety: "L", grade: "F",
      arrivalDate: daysAgo(60), data: rec("OldB", daysAgo(60)),
    });
    await MandiPrice.create({
      commodityKey: "tomato", state: "K", district: "E", market: "Recent", variety: "L", grade: "F",
      arrivalDate: daysAgo(12), data: rec("Recent", daysAgo(12)),
    });
    get.mockResolvedValue(ok([]));
    const r = await svc.getMandiRecords("Tomato");
    expect(r.date).toBe(daysAgo(12).toISOString().slice(0, 10));
    expect(r.records.map((x) => x.market)).toEqual(["Recent"]);
  });
});

describe("when data.gov.in fails, the stored prices are shown", () => {
  test("429 with stored prices: serves them from the database, no error", async () => {
    await MandiPrice.create({
      commodityKey: "walnut", state: "K", district: "E", market: "Aluva", variety: "L", grade: "F",
      arrivalDate: daysAgo(1), data: rec("Aluva", daysAgo(1)),
    });
    get.mockRejectedValue(upstreamError(429));
    const r = await svc.getMandiRecords("Walnut");
    expect(r).toMatchObject({ source: "database", isToday: false });
    expect(r.records).toHaveLength(1);
  });

  test("nothing stored and data.gov.in refuses: 429 stays 429, other failures are 502", async () => {
    get.mockRejectedValue(upstreamError(429));
    await expect(svc.getMandiRecords("Rice")).rejects.toMatchObject({ status: 429 });
    expect(get).toHaveBeenCalledTimes(1); // 429 is not retried

    svc.resetMandiState();
    get.mockReset();
    get.mockRejectedValue(upstreamError(503));
    await expect(svc.getMandiRecords("Rice")).rejects.toMatchObject({ status: 502 });
    expect(get).toHaveBeenCalledTimes(2); // 5xx retried once
  });

  test("after a 429 the server backs off instead of calling data.gov.in again", async () => {
    get.mockRejectedValue(upstreamError(429));
    await expect(svc.getMandiRecords("Pineapple")).rejects.toMatchObject({ status: 429 });
    await expect(svc.getMandiRecords("Onion")).rejects.toMatchObject({ status: 429 });
    expect(get).toHaveBeenCalledTimes(1);
    get.mockResolvedValue(ok([rec("Aluva", today())]));
    const r = await svc.getMandiRecords("Onion", Date.now() + svc.COOLDOWN_MS + 1000);
    expect(r.records).toHaveLength(1);
  });

  test("a crop with no reports anywhere is an empty list, not an error", async () => {
    get.mockResolvedValue(ok([]));
    const r = await svc.getMandiRecords("Saffron");
    expect(r).toMatchObject({ records: [], date: null, isToday: false });
  });
});

describe("GET /v1/api/mandi/prices", () => {
  test("validates the commodity and returns the day, flag and source", async () => {
    const bad = mockRes();
    await getMandiPrices({ query: {} }, bad);
    expect(bad.statusCode).toBe(400);
    const tooLong = mockRes();
    await getMandiPrices({ query: { commodity: "x".repeat(61) } }, tooLong);
    expect(tooLong.statusCode).toBe(400);

    get.mockResolvedValue(ok([rec("Aluva", today())]));
    const good = mockRes();
    await getMandiPrices({ query: { commodity: "Tomato" } }, good);
    expect(good.statusCode).toBe(200);
    expect(good.body).toMatchObject({ success: true, isToday: true, source: "live" });
    expect(good.body.date).toBe(today().toISOString().slice(0, 10));
    expect(good.body.records).toHaveLength(1);
  });

  test("maps failures to MANDI_RATE_LIMITED (429) / MANDI_UNAVAILABLE (502)", async () => {
    get.mockRejectedValue(upstreamError(429));
    const a = mockRes();
    await getMandiPrices({ query: { commodity: "Garlic" } }, a);
    expect(a.statusCode).toBe(429);
    expect(a.body.code).toBe("MANDI_RATE_LIMITED");

    svc.resetMandiState();
    get.mockRejectedValue(upstreamError(500));
    const b = mockRes();
    await getMandiPrices({ query: { commodity: "Garlic" } }, b);
    expect(b.statusCode).toBe(502);
    expect(b.body.code).toBe("MANDI_UNAVAILABLE");
  });
});
