/**
 * Server-side crop timeline for the AI agent — avoids LLM date confusion.
 */

function parseSowingDate(sowingDateStr) {
  if (!sowingDateStr || typeof sowingDateStr !== "string") return null;
  const d = new Date(sowingDateStr.trim());
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * @returns {{ label: "PRE_SOWING"|"POST_SOWING"|"UNKNOWN", daysSinceSowing: number|null, daysUntilSowing: number|null, sowingISO: string|null }}
 */
export function getCropTimelineStatus(sowingDateStr, now = new Date()) {
  const sowing = parseSowingDate(sowingDateStr);
  if (!sowing) {
    return {
      label: "UNKNOWN",
      daysSinceSowing: null,
      daysUntilSowing: null,
      sowingISO: null,
    };
  }

  const ms = now.getTime() - sowing.getTime();
  const diffDays = Math.floor(ms / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return {
      label: "PRE_SOWING",
      daysSinceSowing: null,
      daysUntilSowing: -diffDays,
      sowingISO: sowing.toISOString().slice(0, 10),
    };
  }

  return {
    label: "POST_SOWING",
    daysSinceSowing: diffDays,
    daysUntilSowing: null,
    sowingISO: sowing.toISOString().slice(0, 10),
  };
}

export function describeTimelineForPrompt(timeline, registeredRaw) {
  if (timeline.label === "UNKNOWN") {
    return `Timeline: could not parse sowing date "${registeredRaw}". Ask the farmer to confirm sowing date in the app if needed.`;
  }
  if (timeline.label === "PRE_SOWING") {
    return `Timeline: PRE_SOWING — registered sowing date ${registeredRaw} is in ${timeline.daysUntilSowing} day(s). Crop is not yet in the ground for this season; give pre-planting advice only.`;
  }
  return `Timeline: POST_SOWING — ${timeline.daysSinceSowing} day(s) since registered sowing date ${registeredRaw}. Treat the crop as actively growing; give field-stage advice, pest/disease, irrigation, and fertigation. Do NOT say the crop is not sown or waiting to be planted.`;
}

const MAX_REC = 420;
const MAX_ACT = 6;

/**
 * Compact advisory text for the LLM (no raw satellite numbers unless useful).
 */
export function summarizeAdvisoryForPrompt(advisory) {
  if (!advisory || typeof advisory !== "object") return "";

  const lines = [];

  const ch = advisory.cropHealth;
  if (ch && (ch.category != null || ch.score != null || ch.recommendation)) {
    const rec =
      typeof ch.recommendation === "string"
        ? ch.recommendation.slice(0, MAX_REC)
        : "";
    lines.push(
      `Crop health (CropGen): ${ch.category ?? "n/a"}${ch.score != null ? `, score ${ch.score}` : ""}${ch.percentage != null ? ` (${ch.percentage}%)` : ""}${rec ? `. ${rec}` : ""}`,
    );
  }

  const pg = advisory.plantGrowthActivity;
  if (pg && (pg.stageName || pg.description)) {
    const desc =
      typeof pg.description === "string" ? pg.description.slice(0, 280) : "";
    lines.push(
      `Growth stage: ${pg.stageName ?? "n/a"}${pg.bbchStage != null ? ` (BBCH ${pg.bbchStage})` : ""}${pg.cumulativeGDD != null ? `, GDD ${Math.round(pg.cumulativeGDD)}` : ""}${desc ? `. ${desc}` : ""}`,
    );
  }

  const acts = Array.isArray(advisory.activitiesToDo)
    ? advisory.activitiesToDo.slice(0, MAX_ACT)
    : [];
  if (acts.length) {
    const brief = acts
      .map((a) => {
        const t = a?.title || a?.type || "";
        const m =
          typeof a?.message === "string" ? a.message.slice(0, 160) : "";
        const chem =
          a?.details?.chemical || a?.details?.fertilizer
            ? ` [${[a.details.chemical, a.details.fertilizer].filter(Boolean).join(", ")}]`
            : "";
        return m ? `${t}: ${m}${chem}` : `${t}${chem}`;
      })
      .join(" | ");
    lines.push(`Suggested activities: ${brief}`);
  }

  return lines.join("\n");
}
