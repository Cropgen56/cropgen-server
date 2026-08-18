/**
 * Server-side crop timeline for the AI agent — avoids LLM date confusion.
 */

function parseSowingDate(sowingDateStr) {
  if (!sowingDateStr) return null;
  // Legacy FarmField.sowingDate is a String; FieldCrop.startDate (multi-crop)
  // is a real Date — accept either.
  const raw =
    typeof sowingDateStr === "string" ? sowingDateStr.trim() : sowingDateStr;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Renders a Date or date-string as YYYY-MM-DD for prompt text. */
export function formatDateForPrompt(value) {
  const d = value instanceof Date ? value : parseSowingDate(value);
  return d ? d.toISOString().slice(0, 10) : String(value || "unknown");
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

function fmtNum(value, digits = 1) {
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(digits) : null;
}

function farmCentroid(farm) {
  const pts = Array.isArray(farm?.field) ? farm.field : [];
  if (!pts.length) return null;
  const lat = pts.reduce((s, p) => s + Number(p.lat || 0), 0) / pts.length;
  const lng = pts.reduce((s, p) => s + Number(p.lng || 0), 0) / pts.length;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

export function describeFarmerLocationForPrompt(user, farms = []) {
  const loc = [user?.village, user?.city, user?.district, user?.state, user?.pincode]
    .map((v) => (v == null ? "" : String(v).trim()))
    .filter(Boolean)
    .join(", ");
  const firstFarm = Array.isArray(farms) ? farms[0] : farms;
  const geo = farmCentroid(firstFarm);
  const geoLine = geo
    ? ` Field coordinates (approx): ${geo.lat.toFixed(3)}, ${geo.lng.toFixed(3)}.`
    : "";
  if (!loc && !geo) {
    return "Farmer location: not on profile. Infer from the farm polygon if given; never use the company office city as the farmer's village.";
  }
  return `Farmer location: ${loc || "use field coordinates"}.${geoLine} Use THIS location for weather and agronomy — never CropGen/Satagro HQ.`;
}

export function summarizeWeatherForPrompt(weatherSnapshot) {
  if (!weatherSnapshot || typeof weatherSnapshot !== "object") return "";
  const cur = weatherSnapshot.current || {};
  const d3 = weatherSnapshot.next3Days || {};
  const d7 = weatherSnapshot.next7Days || {};
  const bits = [];
  const temp = fmtNum(cur.temp);
  const hum = fmtNum(cur.humidity, 0);
  const rain = fmtNum(cur.rainfall);
  const wind = fmtNum(cur.windSpeed);
  if (temp || hum || rain || wind) {
    bits.push(
      `Now: ${[temp ? `${temp}°C` : null, hum ? `${hum}% humidity` : null, rain ? `${rain} mm rain` : null, wind ? `wind ${wind}` : null].filter(Boolean).join(", ")}`,
    );
  }
  const r3 = fmtNum(d3.rainfallTotal, 0);
  const tmax = fmtNum(d3.tempMax);
  const tmin = fmtNum(d3.tempMin);
  if (r3 || tmax || tmin) {
    bits.push(
      `Next 3 days: ${[r3 ? `${r3} mm rain` : null, tmax && tmin ? `${tmin}–${tmax}°C` : tmax ? `max ${tmax}°C` : null].filter(Boolean).join(", ")}`,
    );
  }
  const r7 = fmtNum(d7.rainfallTotal, 0);
  if (r7) bits.push(`Next 7 days rain: ${r7} mm`);
  if (weatherSnapshot.capturedAt) {
    bits.push(`Snapshot at ${String(weatherSnapshot.capturedAt).slice(0, 16)}`);
  }
  return bits.length ? `Field weather: ${bits.join(". ")}.` : "";
}

function summarizeNpkForPrompt(npk) {
  if (!npk?.required && !npk?.available) return "";
  const req = npk.required || {};
  const av = npk.available || {};
  const def = npk.deficit || {};
  const n = (o, k) => fmtNum(o[k], 1);
  return `NPK kg/ha — required N ${n(req, "nitrogenKgPerHa") ?? "?"} / P ${n(req, "phosphorousKgPerHa") ?? "?"} / K ${n(req, "potassiumKgPerHa") ?? "?"}; available N ${n(av, "nitrogenKgPerHa") ?? "?"} / P ${n(av, "phosphorousKgPerHa") ?? "?"} / K ${n(av, "potassiumKgPerHa") ?? "?"}; deficit N ${n(def, "nitrogenKgPerHa") ?? "0"} / P ${n(def, "phosphorousKgPerHa") ?? "0"} / K ${n(def, "potassiumKgPerHa") ?? "0"}.`;
}

function summarizeYieldForPrompt(y) {
  if (!y || (y.standardYield == null && y.aiYield == null)) return "";
  const unit = y.unit || "quintal";
  const std = y.standardYield != null ? `${y.standardYield} ${unit}` : "n/a";
  const ai = y.aiYield != null ? `${y.aiYield} ${unit}` : "not estimated yet (shown at maturity)";
  return `Yield: standard ${std}; AI ${ai}.`;
}

const MAX_REC = 420;
const MAX_ACT = 6;

/**
 * Compact advisory text for the LLM (no raw satellite numbers unless useful).
 */
export function summarizeAdvisoryForPrompt(advisory) {
  if (!advisory || typeof advisory !== "object") return "";

  const lines = [];

  const weatherLine = summarizeWeatherForPrompt(advisory.weatherSnapshot);
  if (weatherLine) lines.push(weatherLine);

  const ch = advisory.cropHealth;
  if (ch && (ch.category != null || ch.score != null || ch.recommendation)) {
    const rec =
      typeof ch.recommendation === "string"
        ? ch.recommendation.slice(0, MAX_REC)
        : "";
    lines.push(
      `Crop health: ${ch.category ?? "n/a"}${ch.score != null ? `, score ${ch.score}` : ""}${ch.percentage != null ? ` (${ch.percentage}%)` : ""}${rec ? `. ${rec}` : ""}`,
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

  const npkLine = summarizeNpkForPrompt(advisory.npkManagement);
  if (npkLine) lines.push(npkLine);

  const yieldLine = summarizeYieldForPrompt(advisory.yield);
  if (yieldLine) lines.push(yieldLine);

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
