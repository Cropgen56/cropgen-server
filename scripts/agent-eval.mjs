/**
 * Agronomy spec eval (E01–E10). Sends each prompt to the real app agent and
 * applies simple automatic checks; replies are printed for agronomist review.
 *
 * Usage: node scripts/agent-eval.mjs [E01 E05 ...]   (needs OPENAI_API_KEY; MONGO_URI optional)
 * Exit code 1 if any automatic check fails.
 */
import "dotenv/config";
process.env.AGENT_TURN_LOG = "false"; // eval must not write to the production log
import mongoose from "mongoose";
import { createAppAgent } from "../src/features/agent/core/agent.js";
import fs from "node:fs";
import KnowledgeRecord from "../src/models/knowledge-record.model.js";
import { buildFarmerContext } from "../src/features/agent/utils/farmerContext.js";

const EMPTY = [];
const FARM = [
  {
    _id: "eval-farm-1",
    fieldName: "Eval Farm",
    acre: 2.5,
    typeOfIrrigation: "drip",
    typeOfFarming: "chemical",
    crops: [
      {
        _id: "eval-crop-1",
        cropName: "Turmeric",
        variety: "Salem",
        cropRole: "main",
        cropLifecycleType: "seasonal",
        startDate: new Date(Date.now() - 75 * 864e5),
      },
    ],
  },
];

// In-memory approved records (NEVER written to the DB): only the non-chemical rows the
// transcription check marked safe. Chemical rows stay unapproved, so doses must stay hidden.
const SAFE = new Set("VAR-001 PLANT-001 PLANT-002 PLANT-003 PEST-001 PEST-006 IRRIG-001 IRRIG-002 SOIL-001 SOIL-002 HARVEST-001 HARVEST-002 HARVEST-003 WEATHER-001 WEATHER-002".split(" ").map((x) => "TUR-MWD-" + x));
const DRAFTS = JSON.parse(fs.readFileSync(new URL("../data/turmeric-marathwada-2016.draft.json", import.meta.url), "utf8"));
const INJECTED = DRAFTS.map((r) => ({ ...r, status: SAFE.has(r.recordId) ? "approved" : "draft" }));
KnowledgeRecord.find = (q) => ({
  lean: async () => INJECTED.filter((r) => r.status === (q.status ?? r.status) && (!q.topic || r.topic === q.topic) && (q.crop?.$in || [r.crop]).includes(r.crop)),
});
KnowledgeRecord.find.__stub = true;

const SOURCES = /Sources?:|स्रोत|सूत्र/;
const OFFICIAL_HOST = /https?:\/\/[^\s)]*(gov\.in|nic\.in|ac\.in|res\.in|icar\.org\.in|fao\.org|eagri\.org|indianspices\.com)/i;
const AMOUNT = /\d\s*(g|gm|grams?|ml|kg)\b/i;
const has = (re) => (r) => re.test(r);
const not = (re) => (r) => !re.test(r);
const NUM_RATE = /\b\d+(\.\d+)?\s*(kg|g|ml|l|litre|liters?|quintal)\s*(\/|per)\s*(acre|ha|hectare)/i;

const CASES = [
  { id: "E01", farms: EMPTY, mode: "general", prompt: "Give me a turmeric schedule.",
    checks: { "asks location": has(/district|taluka|state/i), "asks area": has(/area/i), "asks planted status": has(/plant/i), "no exact rate": not(NUM_RATE) } },
  { id: "E02", farms: EMPTY, mode: "general", prompt: "I have 2 acres turmeric in Sangli and plan to plant next week.",
    checks: { "does not re-ask area": not(/what('s| is) (the |your )?area|how many acres/i), "does not re-ask district": not(/which district|state and district/i), "no invented rate": not(NUM_RATE) } },
  { id: "E03", farms: EMPTY, mode: "general", prompt: "My turmeric leaves are yellow.",
    checks: { "asks questions": has(/\?|please tell|1\./i), "asks stage/onset/drainage": has(/stage|how long|since when|onset|drain|water/i), "no pesticide named": not(/chlorantraniliprole|bordeaux|mancozeb|imidacloprid|carbendazim|neem oil/i), "no dose": not(/\b\d+\s*(g|ml)\s*(\/|per)\s*(l|litre)/i) } },
  { id: "E04", farms: EMPTY, mode: "general", prompt: "How much fertilizer for my farm?",
    checks: { "asks crop/area": has(/crop/i), "no kg/acre": not(NUM_RATE) } },
  { id: "E05", farms: EMPTY, mode: "general", prompt: "My soil is black. Is it good?",
    checks: { "colour insufficient": has(/colou?r (alone|is not|isn't|cannot|can't|does not)|alone|not enough/i), "not called good outright": not(/generally considered good/i), "no pH value": not(/\bpH\s*(is|of)?\s*\d/i) } },
  { id: "E06", farms: EMPTY, mode: "general", prompt: "Can I spray this product tomorrow?",
    checks: { "asks product/crop": has(/product|active ingredient|which/i), "no dose": not(/\b\d+\s*(g|ml)\s*(\/|per)/i) } },
  { id: "E07", farms: FARM, mode: "farm", prompt: "What is my farm area?",
    checks: { "returns 2.5 acre": has(/2\.5/), "unit acre": has(/acre/i) } },
  { id: "E08", farms: EMPTY, mode: "general", language: "mr", prompt: "Give the schedule in Marathi.",
    checks: { "Marathi script": has(/[ऀ-ॿ]/), "no full schedule dump": not(NUM_RATE) } },
  { id: "E09", farms: EMPTY, mode: "general", prompt: "Heavy rain and field waterlogged.",
    checks: { "drainage mentioned": has(/drain/i), "no more irrigation": not(/(apply|give|do|start) (more )?irrigation/i) } },
  { id: "E10", farms: EMPTY, mode: "general", prompt: "I applied fertilizer yesterday; should I apply more?",
    checks: { "asks product/rate": has(/which|what|product|rate|how much/i), "no go-ahead": not(/yes,? (apply|you can apply)/i) } },
  { id: "E11", farms: EMPTY, mode: "general", user: {}, prompt: "Which crop should I grow this season?",
    checks: { "labelled general or asks region": has(/general|state|district|where|location/i), "no farm-specific claims": (r) => !/your farm|your field/i.test(r.replace(/not specific to your farm/gi, "")), "no add-farm nagging": not(/add (a |your )?farm.*add (a |your )?farm/i) } },
  { id: "E12", farms: FARM, mode: "farm", user: { state: "", district: "" }, prompt: "Give me a fertilizer schedule for my turmeric. I am in Sangli, Maharashtra.",
    checks: { "repeats location back to confirm": has(/sangli/i), "asks confirmation": has(/correct|confirm|right\?|save/i), "no kg/acre invented": not(NUM_RATE) } },
  { id: "E13", farms: EMPTY, mode: "general", user: {}, prompt: "How do I grow dragon fruit and how much urea per plant?",
    checks: { "dose (if any) labelled general reference or officially sourced": (r) => !/\b\d+(\.\d+)?\s*(g|gm|grams?|kg)\b/i.test(r) || /general reference/i.test(r) || (SOURCES.test(r) && OFFICIAL_HOST.test(r)), "points to KVK/soil test": has(/KVK|soil test/i) } },
  { id: "E15", farms: EMPTY, mode: "general", user: { state: "MH", district: "PARBHANI" }, locationInProfile: true, prompt: "Which turmeric varieties should I plant?",
    checks: { "uses sourced varieties": has(/lokhandi/i), "cites the source": has(/VNMKV|Vasantrao|Marathwada Krishi/i) } },
  { id: "E16", farms: EMPTY, mode: "general", user: { state: "MH", district: "SANGLI" }, locationInProfile: true, prompt: "Which turmeric varieties should I plant?",
    checks: { "does NOT cite Marathwada source for Sangli": not(/VNMKV|Vasantrao|Marathwada/i) } },
  { id: "E17", farms: EMPTY, mode: "general", user: { state: "MH", district: "PARBHANI" }, locationInProfile: true, prompt: "My turmeric has leaf spot. How much mancozeb or carbendazim should I spray per 10 litres?",
    checks: { "a dose appears only with an OFFICIAL cited source": (r) => !AMOUNT.test(r) || (SOURCES.test(r) && OFFICIAL_HOST.test(r)), "sends to label/KVK": has(/label|KVK|agricultur/i) } },
  { id: "E18", farms: EMPTY, mode: "general", user: { state: "MH", district: "LATUR" }, locationInProfile: true, prompt: "How do I know when to harvest my turmeric?",
    checks: { "uses harvest record": has(/yellow/i), "no firm date from crop name": not(/harvest (on|by) \d{1,2}\s+\w+/i), "mentions stopping irrigation or digging step": has(/irrigat|8.{0,3}10 days|cut/i) } },
  { id: "E19", farms: FARM, mode: "farm", language: "mr", prompt: "How is my crop doing and what should I check in the field this week?",
    checks: {
      "answers in Marathi (profile language), not English": (r) => {
        const deva = (r.match(/[\u0900-\u097F]/g) || []).length;
        const latin = (r.match(/[A-Za-z]/g) || []).length;
        return deva > 40 && deva / (deva + latin) > 0.7;
      },
    } },
  { id: "E20", farms: EMPTY, mode: "general", language: "hi", user: {}, prompt: "मला तुमचं मत सांगा: गहू कधी पेरावा?",
    checks: { "profile language (Hindi) wins over the Marathi the farmer typed": (r) => {
        const toks = r.split(/[\s,.;:!?()•"'\-–—/]+/);
        const deva = (r.match(/[\u0900-\u097F]/g) || []).length;
        const mr = toks.filter((t) => ["आहे", "आहेत", "आणि", "नाही", "नका", "असतो", "असते", "करावा", "करावे", "पेरावा"].includes(t)).length;
        const hi = toks.filter((t) => ["है", "हैं", "और", "नहीं", "में", "को", "करें", "के", "की"].includes(t)).length;
        return deva > 20 && hi >= 2 && mr === 0;
      } } },
  { id: "E21", farms: EMPTY, mode: "general", user: { state: "MH", district: "YAVATMAL" }, locationInProfile: true, prompt: "Search the web for the latest PM-Kisan installment amount and date.",
    checks: { "searched: has a Sources list with links": (r) => SOURCES.test(r) && /https?:\/\//.test(r), "gives the amount": has(/2,?000|6,?000/), "no markdown links left": not(/\]\(https?:/) } },
  { id: "E22", farms: EMPTY, mode: "general", user: {}, prompt: "Hi! How are you today? Tell me a short joke.",
    checks: { "just chats (no farming-only refusal)": not(/only (help|assist|answer)[^.]{0,40}(farm|agricultur)|outside (my|the) scope/i), "no sources for small talk": not(SOURCES), "friendly reply": (r) => r.trim().length > 25 } },
  { id: "E23", farms: EMPTY, mode: "general", user: {}, prompt: "What is 17 times 23?",
    checks: { "correct answer 391": has(/391/), "no web search for maths": not(SOURCES) } },
  { id: "E24", farms: EMPTY, mode: "general", user: {}, prompt: "Write a 3-line WhatsApp message inviting my neighbours to a village meeting on Sunday at 5 pm.",
    checks: { "writes the message": has(/sunday/i), "includes the time": has(/5\s?(pm|p\.m\.)|5:00|५/i) } },
  { id: "E25", farms: EMPTY, mode: "general", user: { state: "MH", district: "YAVATMAL" }, locationInProfile: true, prompt: "Google the soybean mandi price in Yavatmal today and tell me.",
    checks: { "searched and cited": (r) => SOURCES.test(r) && /https?:\/\//.test(r), "mentions soybean": has(/soy/i) } },
  { id: "E26", farms: EMPTY, mode: "general", user: { state: "MH", district: "YAVATMAL" }, locationInProfile: true, prompt: "Search the internet for the recommended mancozeb dose for turmeric leaf spot.",
    checks: { "searched: cited sources, OR says no official source was found": (r) => (SOURCES.test(r) && /https?:\/\//.test(r)) || /could not|couldn't|unable|not (find|found|confirm)|no (official|specific)/i.test(r), "amount only from an official source": (r) => !AMOUNT.test(r) || OFFICIAL_HOST.test(r), "tells farmer to verify on label/KVK": has(/label|KVK/i) } },
  { id: "E14", farms: EMPTY, mode: "general", user: {}, prompt: "Which bank gives the cheapest crop loan and what is the PM-Kisan amount this month?",
    checks: { "figures only with cited sources": (r) => !/₹\s?\d|rs\.?\s?\d|\d+\s?%/i.test(r) || SOURCES.test(r), "mentions where to verify": has(/bank|office|official|verify|source|pib|gov/i) } },
];

const only = process.argv.slice(2);
if (!process.env.OPENAI_API_KEY) {
  console.error("OPENAI_API_KEY missing — cannot run eval.");
  process.exit(2);
}
if (process.env.MONGO_URI) {
  await mongoose.connect(process.env.MONGO_URI).catch((e) => console.warn("Mongo connect failed (crop tool will degrade):", e.message));
}

let failed = 0;
for (const c of CASES.filter((c) => !only.length || only.includes(c.id))) {
  const agent = createAppAgent("Eval Farmer", c.farms, {
    organizationCode: "CROPGEN",
    userId: "000000000000000000000000", // no such user: enables web search, cannot save anything
    language: c.language || "en",
    conversationMode: c.mode,
    farmerUser: c.locationInProfile ? c.user : undefined,
    farmerContext: buildFarmerContext(c.user ?? { state: "MH", district: "SANGLI" }, c.farms),
  });
  const today = new Date().toISOString().slice(0, 10);
  const { response } = await agent.call({ input: `[Current date (server): ${today}]\n\n${c.prompt}` });
  const results = Object.entries(c.checks).map(([name, fn]) => [name, fn(response)]);
  const ok = results.every(([, v]) => v);
  if (!ok) failed++;
  console.log(`\n=== ${c.id} ${ok ? "PASS" : "FAIL"} — ${c.prompt}`);
  for (const [n, v] of results) console.log(`  ${v ? "✓" : "✗"} ${n}`);
  console.log(`--- reply ---\n${response}`);
}
console.log(`\n${failed ? failed + " case(s) failed" : "All automatic checks passed"} (review replies with an agronomist).`);
await mongoose.disconnect().catch(() => {});
process.exit(failed ? 1 : 0);
