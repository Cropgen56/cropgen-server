import axios from "axios";
import MandiPrice from "../models/mandi-price.model.js";

/**
 * Mandi (market) prices: loaded from data.gov.in, stored in MongoDB, and always
 * shown for ONE day.
 *
 *   1. When the commodity is due for a refresh (see below) the server calls
 *      data.gov.in directly and upserts every record into MongoDB.
 *   2. The response is read from MongoDB: today's prices when they exist,
 *      otherwise the most recent earlier day that was stored (normally
 *      yesterday), never a mix of days.
 *   3. If data.gov.in fails or rate-limits (429), nothing changes: the stored
 *      prices are served. An error is returned only when the database has
 *      nothing for that commodity either.
 *
 * "Due for a refresh": at most one upstream call per commodity every 30 minutes
 * (5 if it returned nothing), simultaneous requests share one call, and after a
 * 429 the server stops calling data.gov.in for a minute.
 *
 * Set MANDI_API_KEY (free key from data.gov.in) for full results; without it
 * the public sample key is used (10 records per request).
 */
const RESOURCE_ID = "9ef84268-d588-465a-a308-a864a43d0070";
const URL = `https://api.data.gov.in/resource/${RESOURCE_ID}`;
const SAMPLE_KEY = "579b464db66ec23bdd000001cdd3946e44ce4aad7209ff7b23ac571b";

export const REFRESH_MS = 30 * 60 * 1000;
export const EMPTY_REFRESH_MS = 5 * 60 * 1000;
export const COOLDOWN_MS = 60 * 1000;
/** Older stored prices than this are not shown (they would mislead). */
export const MAX_AGE_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

const lastRefresh = new Map(); // commodityKey -> { at, empty }
const inflight = new Map(); // commodityKey -> Promise
let rateLimitedUntil = 0;

const keyOf = (commodity) => String(commodity).trim().toLowerCase();

export function resetMandiState() {
  lastRefresh.clear();
  inflight.clear();
  rateLimitedUntil = 0;
}

/** "12/11/2026" (dd/mm/yyyy) -> Date at UTC midnight, or null. */
export function parseArrivalDate(value) {
  const m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(String(value || "").trim());
  if (!m) return null;
  const [, d, mo, y] = m.map(Number);
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCMonth() === mo - 1 ? date : null;
}

/** Today's calendar date in India (UTC midnight), the timezone Agmarknet reports in. */
export function todayIst(now = Date.now()) {
  const ist = new Date(now + 5.5 * 60 * 60 * 1000);
  return new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()));
}

async function fetchUpstream(commodity) {
  let lastError;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const { data } = await axios.get(URL, {
        params: {
          "api-key": process.env.MANDI_API_KEY || SAMPLE_KEY,
          format: "json",
          "filters[commodity]": commodity,
          offset: 0,
          limit: 50,
        },
        headers: { accept: "application/json" },
        timeout: 15000,
      });
      // data.gov.in sometimes answers 200 "No query was recieved" (sic).
      if (/no query was rec/i.test(String(data?.message || ""))) {
        lastError = new Error("Mandi service did not process the request");
        continue;
      }
      return Array.isArray(data?.records) ? data.records : [];
    } catch (err) {
      lastError = err;
      const status = err?.response?.status;
      if (status && status < 500) break; // 4xx incl. 429: retrying now won't help
    }
  }
  throw lastError;
}

/** Upserts API records into MongoDB. Returns how many had a usable date. */
async function storeRecords(commodityKey, records) {
  const ops = [];
  for (const rec of records) {
    const arrivalDate = parseArrivalDate(rec.arrival_date);
    if (!arrivalDate) continue;
    const id = {
      commodityKey,
      state: rec.state || "",
      district: rec.district || "",
      market: rec.market || "",
      variety: rec.variety || "",
      grade: rec.grade || "",
      arrivalDate,
    };
    ops.push({
      updateOne: {
        filter: id,
        update: { $set: { data: rec, fetchedAt: new Date() }, $setOnInsert: id },
        upsert: true,
      },
    });
  }
  if (ops.length) await MandiPrice.bulkWrite(ops, { ordered: false });
  return ops.length;
}

/** Calls data.gov.in and stores the result, if this commodity is due. Never throws. */
async function refreshIfDue(commodity, key, now) {
  const last = lastRefresh.get(key);
  if (last && now - last.at < (last.empty ? EMPTY_REFRESH_MS : REFRESH_MS)) {
    return { attempted: false, error: null };
  }
  if (now < rateLimitedUntil) {
    return { attempted: false, error: Object.assign(new Error("rate limited"), { status: 429 }) };
  }

  let pending = inflight.get(key);
  if (!pending) {
    pending = fetchUpstream(commodity)
      .then(async (records) => {
        const stored = await storeRecords(key, records);
        lastRefresh.set(key, { at: Date.now(), empty: stored === 0 });
        return null;
      })
      .catch((err) => {
        if (err?.response?.status === 429) rateLimitedUntil = Date.now() + COOLDOWN_MS;
        return err;
      })
      .finally(() => inflight.delete(key));
    inflight.set(key, pending);
  }
  const error = await pending;
  return { attempted: true, error };
}

/**
 * The prices to show: today's if stored, else the latest earlier day (within
 * MAX_AGE_DAYS). One day only.
 */
async function readStored(key, now) {
  const today = todayIst(now);
  const oldest = new Date(today.getTime() - MAX_AGE_DAYS * DAY_MS);
  const latest = await MandiPrice.findOne({
    commodityKey: key,
    arrivalDate: { $lte: today, $gte: oldest },
  })
    .sort({ arrivalDate: -1 })
    .select("arrivalDate")
    .lean();
  if (!latest) return null;
  const rows = await MandiPrice.find({ commodityKey: key, arrivalDate: latest.arrivalDate })
    .select("data")
    .lean();
  return {
    date: latest.arrivalDate,
    isToday: latest.arrivalDate.getTime() === today.getTime(),
    records: rows.map((r) => r.data),
  };
}

/**
 * @returns {Promise<{records: object[], date: string|null, isToday: boolean, source: "live"|"database"}>}
 * `source` is "live" when data.gov.in answered on this request, else "database".
 * Throws (with `.status` 429 | 502) only when there is nothing stored to show
 * and data.gov.in could not be reached.
 */
export async function getMandiRecords(commodity, now = Date.now()) {
  const key = keyOf(commodity);
  const { attempted, error } = await refreshIfDue(commodity, key, now);
  const stored = await readStored(key, now);

  if (stored) {
    return {
      records: stored.records,
      date: stored.date.toISOString().slice(0, 10),
      isToday: stored.isToday,
      source: attempted && !error ? "live" : "database",
    };
  }
  if (error) {
    const e = new Error(error.message || "Mandi service unavailable");
    e.status = error.status === 429 || error?.response?.status === 429 ? 429 : 502;
    throw e;
  }
  // data.gov.in answered (or was recently asked) and has no reports for it.
  return { records: [], date: null, isToday: false, source: "database" };
}
