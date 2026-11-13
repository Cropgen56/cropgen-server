/**
 * Pre/post-release check and safe migration for the subscription release
 * (free trial, plan-feature locks, plan-switch refunds, mandi price cache).
 *
 * READ-ONLY by default. It prints findings and the fixes it WOULD make:
 *
 *   MONGO_URI="mongodb+srv://..." node src/scripts/migrate-subscription-release.mjs
 *
 * With --apply it performs only these additive, reversible-in-practice steps:
 *   1. backfill `features.cropCalendar: false` on plans that lack the flag
 *      (the app treats a missing flag as "off" already; this just makes it explicit);
 *   2. drop the legacy one-trial-per-account index (userId_1_billingCycle_1,
 *      user_1_billingCycle_1) if present, which blocks a second farm's trial;
 *   3. sync the UserSubscription and MandiPrice indexes (the server also does
 *      this at startup; running it here surfaces duplicate-key problems first).
 *
 * It NEVER changes plan prices, subscription statuses, or deletes data.
 * Findings that need a human decision are reported as WARN and left alone.
 *
 * Exit code: 0 = nothing blocking, 1 = at least one BLOCKER found.
 */
import "dotenv/config";
import mongoose from "mongoose";
import SubscriptionPlan from "../models/subscription-plan.model.js";
import UserSubscription from "../models/user-subscription.model.js";
import MandiPrice from "../models/mandi-price.model.js";

const APPLY = process.argv.includes("--apply");
const uri = process.env.MONGO_URI;
if (!uri) {
  console.error("MONGO_URI is not set.");
  process.exit(2);
}

let blockers = 0;
const ok = (m) => console.log(`  OK    ${m}`);
const warn = (m) => console.log(`  WARN  ${m}`);
const block = (m) => {
  blockers += 1;
  console.log(`  BLOCK ${m}`);
};
const todo = (m) => console.log(`  ${APPLY ? "DONE " : "TODO "} ${m}`);

await mongoose.connect(uri);
const host = (() => {
  try {
    return new URL(uri.replace("mongodb+srv://", "https://").replace("mongodb://", "http://")).hostname;
  } catch {
    return "?";
  }
})();
console.log(`${APPLY ? "APPLY" : "DRY RUN"} against ${mongoose.connection.name} @ ${host}\n`);

const db = mongoose.connection.db;
const plans = await db.collection("subscriptionplans").find({}).toArray();
const subs = db.collection("usersubscriptions");

/* ---------- 1. plan catalogue the free trial depends on ---------- */
console.log("1. Plan catalogue");
const bySlug = (slug, platform) =>
  plans.find((p) => p.brand === "cropgen" && p.slug === slug && (!platform || p.platform === platform));
const growth = bySlug(process.env.FREE_TRIAL_PLAN_SLUG || "pro-plan", "web");
const basic = bySlug(process.env.FREE_TRIAL_PLAN_SLUG_INR || "base-plan-mobile", "all");
const hasRow = (p, cur, cycle) => (p?.pricing || []).some((r) => r.currency === cur && r.billingCycle === cycle && r.pricePerUnitMinor > 0);
if (!growth) block('Growth plan (brand cropgen, platform web, slug "pro-plan") not found: the USD free trial has nothing to offer.');
else if (!hasRow(growth, "USD", "monthly") || !hasRow(growth, "USD", "yearly")) block("Growth plan lacks USD monthly/yearly prices: autopay cannot be set up, so the trial is refused.");
else ok(`Growth plan "${growth.name}" is present with USD monthly + yearly prices`);
if (!basic) block('Basic plan (brand cropgen, platform all, slug "base-plan-mobile") not found: the INR free trial has nothing to offer.');
else if (!hasRow(basic, "INR", "monthly") || !hasRow(basic, "INR", "yearly")) block("Basic plan lacks INR monthly/yearly prices.");
else ok(`Basic plan "${basic.name}" is present with INR monthly + yearly prices`);
const enabled = (p) => Object.values(p?.features || {}).some(Boolean);
if (growth && !enabled(growth)) warn("Growth plan has no features enabled: trial users would get nothing.");
if (basic && !enabled(basic)) warn("Basic plan has no features enabled: trial users would get nothing.");

/* ---------- 2. strict feature rule: who would lose access ---------- */
console.log("\n2. Active subscriptions vs the stricter plan-feature rule");
const planById = new Map(plans.map((p) => [String(p._id), p]));
let allFalse = 0;
const allFalsePlans = new Set();
let missingPlan = 0;
let totalActive = 0;
for await (const s of subs.find({ status: "active" }, { projection: { planId: 1 } })) {
  totalActive += 1;
  const p = planById.get(String(s.planId));
  if (!p) { missingPlan += 1; continue; }
  if (p.features && !Object.values(p.features).some(Boolean)) {
    allFalse += 1;
    allFalsePlans.add(`${p.brand}/${p.slug}`);
  }
}
ok(`${totalActive} active subscriptions`);
if (allFalse) block(`${allFalse} active subscriptions are on plans with EVERY feature off (${[...allFalsePlans].join(", ")}): the new rule locks all of their features. Enable features on those plans first.`);
else ok("no active subscription is on an all-features-off plan");
if (missingPlan) warn(`${missingPlan} active subscriptions point at a deleted plan (the app keeps full access for these, by design).`);

/* ---------- 3. data shape ---------- */
console.log("\n3. Subscription data");
const dupes = await subs.aggregate([
  { $match: { status: "active" } },
  { $group: { _id: { u: "$userId", f: "$fieldId" }, n: { $sum: 1 } } },
  { $match: { n: { $gt: 1 } } },
  { $count: "farms" },
]).toArray();
if (dupes[0]?.farms) warn(`${dupes[0].farms} farms have more than one ACTIVE subscription (old data). A plan switch retires the older ones from now on; list them with the aggregate in this script if you want to clean up by hand.`);
else ok("no farm has more than one active subscription");
const stuck = await subs.countDocuments({ status: "pending", subscriptionPhase: "trial_mandate_pending", createdAt: { $lt: new Date(Date.now() - 7 * 86400000) } });
if (stuck) warn(`${stuck} trial checkouts have sat unfinished for over 7 days (harmless: they never count as a used trial).`);
else ok("no stale unfinished trial checkouts");

/* ---------- 4. fixes ---------- */
console.log("\n4. Fixes");
const lacking = plans.filter((p) => p.features && !("cropCalendar" in p.features));
if (lacking.length) {
  todo(`add features.cropCalendar=false to ${lacking.length} plan(s): ${lacking.map((p) => p.slug).join(", ")}`);
  if (APPLY) await db.collection("subscriptionplans").updateMany({ "features.cropCalendar": { $exists: false } }, { $set: { "features.cropCalendar": false } });
} else ok("every plan already has the cropCalendar flag");

const idx = await subs.indexes();
const legacy = idx.filter((i) => ["userId_1_billingCycle_1", "user_1_billingCycle_1"].includes(i.name));
if (legacy.length) {
  todo(`drop legacy trial index ${legacy.map((i) => i.name).join(", ")}`);
  if (APPLY) for (const i of legacy) await subs.dropIndex(i.name);
} else ok("no legacy one-trial-per-account index");

const wantFreeTrialIdx = idx.some((i) => i.name === "userId_1_freeTrialOffer_1");
const mandiExists = (await db.listCollections({ name: "mandiprices" }).toArray()).length > 0;
if (!wantFreeTrialIdx || !mandiExists) {
  todo(`${!wantFreeTrialIdx ? "create index userId_1_freeTrialOffer_1; " : ""}${!mandiExists ? "create the mandiprices collection and its indexes" : ""}`);
}
if (APPLY) {
  await UserSubscription.syncIndexes();
  await MandiPrice.syncIndexes();
  ok("UserSubscription and MandiPrice indexes synced");
}

console.log(`\n${blockers ? `${blockers} BLOCKER(s): resolve before releasing.` : "No blockers."}${APPLY ? "" : "  (dry run: nothing was changed; add --apply to run the fixes)"}`);
await mongoose.disconnect();
process.exit(blockers ? 1 : 0);
