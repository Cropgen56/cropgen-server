import { STATE_CODE_ALIASES } from "../../../clients/biodrops/utils/indianStates.js";

const clean = (v) => String(v ?? "").trim();
const has = (v) => clean(v).length > 0;

/** Free text / alias / code -> canonical 2-letter state code, or null. */
export function normalizeStateCode(input) {
  const raw = clean(input).toUpperCase().replace(/\s+/g, " ");
  if (!raw) return null;
  if (STATE_CODE_ALIASES[raw]) {
    // TS and UT are legacy duplicates of TG / UK
    return raw === "TS" ? "TG" : raw === "UT" ? "UK" : raw;
  }
  const squashed = raw.replace(/ /g, "");
  for (const [code, names] of Object.entries(STATE_CODE_ALIASES)) {
    if (names.some((n) => n === raw || n.replace(/ /g, "") === squashed)) {
      return code === "TS" ? "TG" : code === "UT" ? "UK" : code;
    }
  }
  return null;
}

/** True if the text names an Indian state ("…Sangli, Maharashtra", "I am in MP"). */
export function mentionsIndianState(text) {
  const words = String(text || "").toLowerCase().match(/[\p{L}\p{M}]+/gu) || [];
  for (let n = 1; n <= 3; n++) {
    for (let i = 0; i + n <= words.length; i++) {
      const phrase = words.slice(i, i + n).join(" ");
      // two-letter words ("in", "to", "or"…) are not treated as state codes unless written as capitals
      if (phrase.length <= 2) continue;
      if (normalizeStateCode(phrase)) return true;
    }
  }
  return false;
}

export function stateDisplayName(code) {
  const names = STATE_CODE_ALIASES[String(code || "").toUpperCase()];
  if (!names?.length) return clean(code);
  return names[0].toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Decide, in code, which situation the farmer is in and exactly what is missing.
 * @returns {{ farmerState: "NO_FARM"|"FARM_INCOMPLETE"|"FARM_COMPLETE",
 *   profileMissing: string[], farmMissing: string[], known: object }}
 */
export function buildFarmerContext(user, farms = []) {
  const profileMissing = [];
  if (!has(user?.state)) profileMissing.push("state");
  if (!has(user?.district)) profileMissing.push("district");

  const farmList = Array.isArray(farms) ? farms : [];
  const farmMissing = [];
  for (const f of farmList) {
    const label = f.fieldName ? `farm "${f.fieldName}"` : "a farm";
    const crops = Array.isArray(f.crops) ? f.crops : null;
    const hasCrop = crops ? crops.length > 0 : has(f.cropName);
    const hasStart = crops
      ? crops.some((c) => c.startDate)
      : Boolean(f.sowingDate);
    if (!(Number(f.acre) > 0)) farmMissing.push(`${label}: area`);
    if (!hasCrop) farmMissing.push(`${label}: crop`);
    else if (!hasStart) farmMissing.push(`${label}: sowing/planting date`);
  }

  const farmerState = farmList.length === 0
    ? "NO_FARM"
    : profileMissing.length || farmMissing.length
      ? "FARM_INCOMPLETE"
      : "FARM_COMPLETE";

  return {
    farmerState,
    profileMissing,
    farmMissing,
    known: {
      state: has(user?.state) ? clean(user.state) : null,
      district: has(user?.district) ? clean(user.district) : null,
      village: has(user?.village) ? clean(user.village) : null,
      farmCount: farmList.length,
    },
  };
}

/** Prompt block with server-computed facts and the behaviour for each situation. */
export function describeFarmerContextForPrompt(ctx) {
  if (!ctx) return "";
  const lines = [
    "=== FARMER PROFILE STATUS (server-computed — trust this, do not guess) ===",
    `Situation: ${ctx.farmerState}`,
    `Profile fields missing: ${ctx.profileMissing.length ? ctx.profileMissing.join(", ") : "none"}`,
    `Farm details missing: ${ctx.farmMissing.length ? ctx.farmMissing.join("; ") : "none"}`,
  ];
  const rules = [];
  if (ctx.farmerState === "NO_FARM") {
    rules.push(
      "• The farmer has no registered farm. Still help: answer as a general advisor, label it 'General guidance (not specific to your farm)'.",
      "• Ask only for crop and state/district when they change the advice. Mention adding a farm in the app ONCE per conversation, never repeatedly.",
    );
  } else if (ctx.farmerState === "FARM_INCOMPLETE") {
    rules.push(
      "• Answer with what you have. Ask for a missing item ONLY when it changes this answer, and ask at most once per item per conversation. If the farmer declines or ignores it, drop it.",
      "• Missing farm items (area, crop, sowing date) cannot be set in chat: tell the farmer to update them on the farm screen in the app.",
    );
  } else {
    rules.push("• Profile and farms are complete. Do not re-ask any of it.");
  }
  if (ctx.profileMissing.length) {
    rules.push(
      `• Missing profile location (${ctx.profileMissing.join(", ")}): when location matters for the answer (schedules, rates, weather, planting), ask for it. If the farmer states their location in a message, still answer their question from it, but END that reply by asking to confirm and save it. Once the farmer tells you, repeat it back ("I'll save Sangli, Maharashtra to your profile — correct?"), and ONLY after they confirm call save_profile_details. Never save a guess, and never save without confirmation.`,
    );
  }
  rules.push(
    "• Crops or topics with no stored data: give general guidance, clearly labelled, and no dose or rate unless it comes from a reviewed record or a cited OFFICIAL web source. Everything that is not about farming (schemes, markets, loans, livestock, machinery, news, writing, maths, chat…): help directly like a general assistant, and use web search for anything current. Never invent scheme details, prices or rules.",
  );
  return `${lines.join("\n")}\n${rules.join("\n")}\n`;
}
