import mongoose from "mongoose";
import AgentTurnLog from "../../../models/agent-turn-log.model.js";

// Any amount of a chemical/fertiliser: number (or range) + mass/volume unit.
const DOSE_RE = /\b(\d+(?:[.,]\d+)?)(?:\s*(?:-|–|to)\s*(\d+(?:[.,]\d+)?))?\s*(?:kg|gm|grams?|mg|ml|qtls?|quintals?|tonnes?|tons?|g)\b/gi;
const NUM_RE = /\d+(?:[.,]\d+)?/g;
const toNum = (x) => Number(String(x).replace(",", "."));

/** Every number a reviewed record states (structured fields + numbers in its text). */
export function numbersFromRecord(rec) {
  const out = new Set();
  const n = rec?.numeric || {};
  for (const v of [rec?.numericValue, rec?.numericValueMax, n.value, n.max]) if (v != null) out.add(toNum(v));
  for (const m of String(rec?.recommendation || "").match(NUM_RE) || []) out.add(toNum(m));
  for (const m of String(rec?.conditions || "").match(NUM_RE) || []) out.add(toNum(m));
  return [...out];
}
const ACCESS_CLAIM = /(don'?t|do not) have (direct |real-?time )?(access|weather)|cannot access|no (real-?time )?access/i;
const REASK_LOCATION = /which (state|district)|state and district|your (state|district)\b.*\?/i;
const trunc = (s, n) => String(s ?? "").slice(0, n);

/** True when the reply states an amount that no reviewed record supplied this turn contains. */
export function hasUnsourcedDose(reply, toolEvents = []) {
  const allowed = new Set(toolEvents.flatMap((t) => (t.name === "get_sourced_guidance" && t.found ? t.numbers || [] : [])));
  for (const m of String(reply || "").matchAll(DOSE_RE)) {
    for (const g of [m[1], m[2]]) if (g != null && !allowed.has(toNum(g))) return true;
  }
  return false;
}

export function extractToolEvents(newItems = []) {
  const calls = new Map();
  const events = [];
  for (const it of newItems) {
    const raw = it?.rawItem || {};
    if (it.type === "tool_call_item") {
      // OpenAI's hosted web search runs inside the model call (no separate output item).
      const isWeb = raw.type === "hosted_tool_call" && /web_search/i.test(raw.name || "");
      const ev = { name: isWeb ? "web_search" : raw.name, args: trunc(raw.arguments, 300) };
      if (isWeb) ev.found = true;
      calls.set(raw.callId || raw.id || events.length, ev);
      events.push(ev);
    } else if (it.type === "tool_call_output_item") {
      const ev = calls.get(raw.callId) || events.find((e) => e.name === raw.name && e.found === undefined);
      let out = it.output;
      try { out = typeof out === "string" ? JSON.parse(out) : out; } catch { out = null; }
      if (ev && out && typeof out === "object") {
        if ("found" in out) ev.found = Boolean(out.found);
        if (Array.isArray(out.records)) {
          ev.recordIds = out.records.map((r) => r.recordId).filter(Boolean);
          ev.numbers = [...new Set(out.records.flatMap(numbersFromRecord))];
        }
        if ("saved" in out) ev.saved = Boolean(out.saved);
      }
    }
  }
  return events;
}

/** Pure: decide which review flags apply to a reply. */
export function analyzeTurn({ reply, toolEvents = [], farmerContext, usedRecovery, isFallback, doseGuard, webSourcedDose }) {
  const flags = [];
  const text = String(reply || "");
  if (hasUnsourcedDose(text, toolEvents)) flags.push("unsourced_number");
  if (ACCESS_CLAIM.test(text)) flags.push("access_disclaimer");
  if (isFallback) flags.push("fallback_reply");
  if (doseGuard) flags.push("dose_blocked");
  if (toolEvents.some((t) => t.name === "web_search")) flags.push("web_search_used");
  if (webSourcedDose) flags.push("web_sourced_dose");
  if (usedRecovery) flags.push("needed_recovery");
  if (farmerContext?.known?.state && farmerContext?.known?.district && REASK_LOCATION.test(text)) {
    flags.push("reasked_known_location");
  }
  if (toolEvents.some((t) => t.name === "save_profile_details" && t.saved)) flags.push("profile_saved");
  if (toolEvents.some((t) => t.name === "get_sourced_guidance" && t.found === false)) flags.push("no_sourced_record");
  const askedQuestions = (text.match(/\?/g) || []).length;
  if (askedQuestions > 4) flags.push("too_many_questions");
  return { flags, askedQuestions };
}

export function logTurn(entry) {
  if (String(process.env.AGENT_TURN_LOG ?? "").toLowerCase() === "false") return;
  if (mongoose.connection.readyState !== 1) return;
  AgentTurnLog.create({
    ...entry,
    userMessage: trunc(entry.userMessage, 500),
    reply: trunc(entry.reply, 2000),
  }).catch((e) => console.error("agent turn log failed:", e.message));
}
