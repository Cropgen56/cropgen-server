import Crop from "../models/crop.model.js";
import MandiPrice from "../models/mandi-price.model.js";
import MandiCommodityCheck from "../models/mandi-commodity-check.model.js";
import { commodityCandidates } from "../utils/mandi/mandiCommodity.js";
import { getMandiRecords } from "./mandi.service.js";

/**
 * Which catalog crops are actually traded in mandis.
 *
 * A crop counts as traded when any of its Agmarknet commodity names (the same
 * names the app looks prices up with) either has prices stored in MongoDB or
 * was found in the government feed by a check. Crops are never guessed:
 *
 *   yes      some name has stored prices / a positive check
 *   no       every name was checked recently and the feed had nothing
 *   unknown  at least one name has not been checked yet (or the negative
 *            answer is older than NEGATIVE_TTL_MS)
 *
 * Unknown names are resolved in the background, one at a time, through
 * getMandiRecords — so they reuse its rate limiting, 429 back-off and storage —
 * and each answer is saved, so this work happens once, not per request.
 */
const MAX_NAMES_PER_CROP = 3; // same cap the app uses per crop
/** A "no prices" answer is trusted this long before the feed is asked again. */
export const NEGATIVE_TTL_MS = 3 * 24 * 60 * 60 * 1000;
/** Pause between feed checks so one run cannot hammer data.gov.in. */
export const CHECK_GAP_MS = 400;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const keyOf = (name) => String(name).trim().toLowerCase();

let running = null;

export function resetTradedState() {
  running = null;
}

/** Resolves when the current background run (if any) has finished. */
export function waitForResolving() {
  return running ?? Promise.resolve();
}

/**
 * Classifies every catalog crop. Pure reads — no upstream calls.
 * @returns {{ traded: string[], pendingCrops: number, unknownNames: string[] }}
 */
export async function classifyCrops(now = Date.now()) {
  const crops = await Crop.find({}).select("cropName").lean();
  const entries = crops
    .map((c) => ({
      name: c.cropName,
      names: commodityCandidates(c.cropName).slice(0, MAX_NAMES_PER_CROP),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const originalByKey = new Map();
  for (const entry of entries) {
    for (const name of entry.names) {
      if (!originalByKey.has(keyOf(name))) originalByKey.set(keyOf(name), name);
    }
  }
  const keys = [...originalByKey.keys()];

  const [storedKeys, checks] = await Promise.all([
    MandiPrice.distinct("commodityKey", { commodityKey: { $in: keys } }),
    MandiCommodityCheck.find({ commodityKey: { $in: keys } }).lean(),
  ]);
  const stored = new Set(storedKeys);
  const checkByKey = new Map(checks.map((c) => [c.commodityKey, c]));

  const stateOf = (key) => {
    if (stored.has(key)) return "yes";
    const check = checkByKey.get(key);
    if (check?.hasData) return "yes";
    if (check && now - new Date(check.checkedAt).getTime() < NEGATIVE_TTL_MS) return "no";
    return "unknown";
  };

  const traded = [];
  let pendingCrops = 0;
  const unknownKeys = new Set();
  for (const entry of entries) {
    const states = entry.names.map((n) => stateOf(keyOf(n)));
    if (states.includes("yes")) {
      traded.push(entry.name);
    } else if (states.includes("unknown")) {
      pendingCrops += 1;
      entry.names.forEach((n) => stateOf(keyOf(n)) === "unknown" && unknownKeys.add(keyOf(n)));
    }
  }
  return {
    traded,
    pendingCrops,
    unknownNames: [...unknownKeys].map((k) => originalByKey.get(k)),
  };
}

async function saveCheck(name, hasData) {
  await MandiCommodityCheck.updateOne(
    { commodityKey: keyOf(name) },
    { $set: { hasData, checkedAt: new Date() } },
    { upsert: true },
  );
}

/**
 * Checks the given names one by one in the background. Only one run at a time.
 * Stops quietly when the feed is rate limiting us; the next request to the
 * endpoint picks up whatever is still unknown.
 */
export function startResolving(names) {
  if (running || !names.length) return running;
  running = (async () => {
    for (const name of names) {
      try {
        const result = await getMandiRecords(name);
        await saveCheck(name, result.records.length > 0);
      } catch (err) {
        if (err?.status === 429) break;
        // Any other failure: leave the name unknown and try again next time.
      }
      await sleep(CHECK_GAP_MS);
    }
  })()
    .catch(() => {})
    .finally(() => {
      running = null;
    });
  return running;
}

/**
 * @returns {Promise<{ crops: string[], complete: boolean, pending: number }>}
 * `crops` are catalog crop names (lower-case, as stored). `complete` is false
 * while some crops are still being checked; call again shortly for more.
 */
export async function getTradedCrops(now = Date.now()) {
  const { traded, pendingCrops, unknownNames } = await classifyCrops(now);
  if (unknownNames.length) startResolving(unknownNames);
  return { crops: traded, complete: pendingCrops === 0, pending: pendingCrops };
}
