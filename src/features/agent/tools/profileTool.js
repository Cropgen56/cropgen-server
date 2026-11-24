import { tool } from "@openai/agents";
import { z } from "zod";
import User from "../../../models/user.model.js";
import { normalizeStateCode, stateDisplayName } from "../utils/farmerContext.js";

const NAME_RE = /^[\p{L}\p{M}][\p{L}\p{M}\s.'()-]{1,60}$/u;

/** Pure validation, exported for tests. */
export function validateProfileInput({ state, district, village }) {
  const out = {};
  const errors = [];
  if (state != null && String(state).trim()) {
    const code = normalizeStateCode(state);
    if (!code) errors.push(`Unrecognised state "${state}"`);
    else out.state = code;
  }
  if (district != null && String(district).trim()) {
    const d = String(district).trim();
    if (!NAME_RE.test(d) || d.length > 32) errors.push(`Invalid district "${district}"`);
    else out.district = d.toUpperCase();
  }
  if (village != null && String(village).trim()) {
    const v = String(village).trim();
    if (!NAME_RE.test(v) || v.length > 100) errors.push(`Invalid village "${village}"`);
    else out.village = v;
  }
  return { out, errors };
}

/**
 * Tool bound to ONE authenticated user. The model never supplies a user id.
 * Writes only state / district / village.
 */
export function createSaveProfileTool(userId, { onSaved } = {}) {
  return tool({
    name: "save_profile_details",
    description:
      "Save the farmer's location to their profile (state, district, village only). Call ONLY after the farmer has confirmed the values you repeated back. Never guess or infer values. Cannot change farm area, crop or dates.",
    parameters: z.object({
      state: z.string().nullable().describe("State name as the farmer said it, or null."),
      district: z.string().nullable().describe("District, or null."),
      village: z.string().nullable().describe("Village/taluka/town, or null."),
      replaceExisting: z
        .boolean()
        .describe("true ONLY if the farmer explicitly said the saved value is wrong or they moved."),
    }),
    async execute({ state, district, village, replaceExisting }) {
      const { out, errors } = validateProfileInput({ state, district, village });
      if (errors.length) {
        return JSON.stringify({ saved: false, errors, note: "Ask the farmer to restate it. Do not save." });
      }
      if (!Object.keys(out).length) {
        return JSON.stringify({ saved: false, note: "Nothing to save." });
      }
      const user = await User.findById(userId).select("state district village").lean();
      if (!user) return JSON.stringify({ saved: false, note: "Profile not found." });

      const set = {};
      const conflicts = [];
      for (const [k, v] of Object.entries(out)) {
        const cur = String(user[k] ?? "").trim();
        const same =
          k === "state"
            ? normalizeStateCode(cur) === v
            : cur.toUpperCase() === String(v).toUpperCase();
        if (!cur || same) set[k] = v;
        else if (replaceExisting) set[k] = v;
        else conflicts.push({ field: k, saved: cur, requested: v });
      }
      if (conflicts.length) {
        return JSON.stringify({
          saved: false,
          conflicts,
          note: "A different value is already saved. Ask the farmer if they want to replace it; only then call again with replaceExisting=true.",
        });
      }
      await User.updateOne({ _id: userId }, { $set: set }, { runValidators: true });
      onSaved?.(set);
      return JSON.stringify({
        saved: true,
        savedFields: set,
        display: { state: set.state ? stateDisplayName(set.state) : undefined },
        note: "Saved. Tell the farmer briefly it is saved and continue with their question using the new location.",
      });
    },
  });
}
