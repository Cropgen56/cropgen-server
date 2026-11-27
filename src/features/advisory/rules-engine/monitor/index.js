/**
 * Crop condition monitor.
 *
 * Compares the field's PREVIOUS condition snapshot with the CURRENT one and with
 * what is EXPECTED for the crop and stage, using Sentinel-2, Sentinel-1, the
 * growth model (GDD/BBCH), weather, the rules-engine decisions and farm history.
 * Anything that changed and matters becomes an event → app popup and, when
 * serious, WhatsApp. Pure function: all I/O lives in services/conditionMonitor.service.js.
 */
import { t } from "../../utils/i18n/advisoryLocale.js";
import { normalizeAdvisoryLanguage } from "../../utils/i18n/advisoryLanguages.js";
import { isCriticalStage } from "../features/cropStage.js";
import { sumField } from "../features/weather.js";
import { formatDayMonth, pestName, sanitizeParam } from "../output/text.js";
import { latestVsReference, sarSignal, expectedValue, daysBetween } from "./signals.js";
import { DETECTORS } from "./detectors.js";
import { reconcileEvents } from "./lifecycle.js";

export const MONITOR_VERSION = "1.0.0";

const OPTICAL = ["NDVI", "NDRE", "NDMI", "EVI"];

function weatherFeatures(series, crop, settings) {
  if (!series?.days?.length) return {};
  const past = series.days.slice(Math.max(0, series.todayIndex - 5), series.todayIndex);
  const heatLimit = Number(crop?.heatLimitC) || Number(settings.heat_alert_c) || 40;
  return {
    rainPast5: past.reduce((s, d) => s + (d.rain ?? 0), 0),
    heatDaysPast5: past.filter((d) => d.tmax !== null && d.tmax >= heatLimit).length,
    rainNext3: sumField(series, "rain", 0, 2),
    heatLimitC: heatLimit,
  };
}

/** Build the condition snapshot for today. */
export function buildConditionSnapshot(input) {
  const { rules, crop, bbch = 0, series, engine, history, previous, now } = input;
  const s = rules.settings;
  const todayISO = now.toISOString().slice(0, 10);

  const s2 = {};
  for (const idx of OPTICAL) {
    const sig = latestVsReference(input.s2?.[idx], { todayISO, maxAgeDays: s.mon_max_scene_age_days });
    if (sig) s2[idx] = sig;
  }
  const lastClear = s2.NDVI?.date || null;
  s2.lastClearDate = lastClear;
  s2.daysSinceClear = lastClear ? daysBetween(lastClear, todayISO) : null;

  const s1 = sarSignal(input.s1, { todayISO, maxAgeDays: s.mon_max_scene_age_days + 2 });
  const d = engine?.decisions || {};
  const irr = d.irrigation || {};
  const spray = d.spray || {};

  // When was the current spray first advised (and not done since)?
  let sprayAdvisedSince = null;
  if (spray.action === "SPRAY") {
    sprayAdvisedSince = previous?.spray?.action === "SPRAY" && previous?.sprayAdvisedSince ? previous.sprayAdvisedSince : todayISO;
    const lastDone = history?.sprays?.[0]?.date;
    if (lastDone && lastDone >= sprayAdvisedSince) sprayAdvisedSince = todayISO;
  }

  const snapshot = {
    version: MONITOR_VERSION,
    date: todayISO,
    cropKey: crop?.key || null,
    bbch,
    principalStage: Math.floor((Number(bbch) || 0) / 10),
    stageName: input.stageName || null,
    stageConfidence: input.stageConfidence ?? null,
    criticalStage: crop ? isCriticalStage(crop, bbch) : false,
    cumulativeGDD: input.cumulativeGDD ?? null,
    gddBbch: input.gddBbch ?? null,
    ndviBbch: input.ndviBbch ?? null,
    ndviConfidence: input.ndviConfidence ?? null,
    s2,
    s1,
    expected: { NDVI: crop ? expectedValue(rules, crop, bbch, "NDVI") : null },
    weather: weatherFeatures(series, crop, s),
    water: { depletionMm: irr.depletionMm ?? null, rawMm: irr.rawMm ?? null, source: irr.depletionSource ?? null },
    irrigation: { action: irr.action || null, critical: Boolean(irr.critical), family: irr.family },
    spray: { action: spray.action || null },
    pest: {
      top: spray.top ? { targetId: spray.top.targetId, risk: spray.top.risk } : null,
      risks: (spray.risks || []).map((r) => ({ targetId: r.targetId, risk: r.risk, consecutiveDays: r.consecutiveDays, ruleId: r.ruleId })),
    },
    fertilizer: { action: d.fertilizer?.action || null },
    weatherAlerts: engine?.alerts || [],
    sprayAdvisedSince,
    flags: {},
  };
  return snapshot;
}

function causeText(cause, rules, lang) {
  if (cause.key === "pest") return pestName(cause.vars?.targetId, rules, lang);
  return t(`mon_cause_${cause.key}`, lang);
}

const WEATHER_KEYS = {
  WEATHER_HEAVY_RAIN: "heavy_rain",
  WEATHER_HEAT: "heat",
  WEATHER_FROST: "frost",
  WEATHER_WIND: "wind",
  WEATHER_DRY_SPELL: "dry_spell",
  WEATHER_WATERLOG: "waterlog",
};

/** The bare irrigation instruction (without the "critical stage" suffix the alert already says). */
function irrigationLine(acts, lang) {
  const a = acts.get("IRRIGATION");
  return a?.details?.coreMessage || a?.message || t("rk_irr_check", lang);
}

/** Farmer-facing title + message for an event. */
export function renderEvent(e, { rules, lang, engine }) {
  const acts = new Map((engine?.activitiesToDo || []).map((a) => [a.type, a]));
  const causes = (e.causes || []).filter((c) => c.key !== "unknown").slice(0, 2).map((c) => causeText(c, rules, lang));
  const cause = causes.length ? causes.join(", ") : t("mon_cause_unknown", lang);
  const v = e.vars || {};
  if (WEATHER_KEYS[e.type]) {
    const k = WEATHER_KEYS[e.type];
    return { title: t(`rk_alert_title_${k}`, lang), message: t(`rk_alert_${k}`, lang, v) };
  }
  switch (e.type) {
    case "VEG_DROP":
      return { title: t("mon_title_veg_drop", lang), message: t("mon_veg_drop", lang, { pct: v.pct, date: formatDayMonth(v.date), cause }) };
    case "VEG_BELOW_EXPECTED":
      return { title: t("mon_title_veg_low", lang), message: t("mon_veg_low", lang, { value: v.value, expected: v.expected, cause }) };
    case "WATER_STRESS":
      return {
        title: t("mon_title_water", lang),
        // Satellite dry but water balance fine → water is applied but not reaching plants.
        message: t("mon_water", lang, {
          action: e.vars?.balanceDry === false ? t("mon_water_check_system", lang) : irrigationLine(acts, lang),
        }),
      };
    case "N_STRESS":
      return { title: t("mon_title_nitrogen", lang), message: t("mon_nitrogen", lang) };
    case "WATERLOG_SAR":
      return { title: t("mon_title_waterlog", lang), message: t("mon_waterlog", lang) };
    case "CANOPY_LOSS_SAR":
      return { title: t("mon_title_canopy_loss", lang), message: t("mon_canopy_loss", lang) };
    case "STAGE_CHANGE": {
      const base = t("mon_stage", lang, { stage: v.stage });
      return { title: t("mon_title_stage", lang), message: v.critical ? `${base} ${t("mon_stage_critical", lang)}` : base };
    }
    case "GROWTH_DELAY":
      return { title: t("mon_title_delay", lang), message: t("mon_delay", lang, { cause }) };
    case "PEST_RISK": {
      const pest = pestName(v.targetId, rules, lang);
      // Today's spray instruction is for the engine's top target only; other pests get "inspect first".
      const isTop = engine?.decisions?.spray?.top?.targetId === v.targetId;
      const action = isTop && acts.get("SPRAY")?.message ? acts.get("SPRAY").message : t("rk_spray_monitor", lang, { pest });
      return { title: t("rk_alert_title_pest", lang), message: t("mon_pest", lang, { pest, action }).trim() };
    }
    case "IRRIGATION_CRITICAL":
      return {
        title: t("mon_title_irr_critical", lang),
        message: t("mon_irr_critical", lang, { action: irrigationLine(acts, lang) }).trim(),
      };
    case "TASK_OVERDUE":
      return {
        title: t("mon_title_overdue", lang),
        message: t("mon_overdue", lang, { pest: pestName(v.targetId, rules, lang), date: formatDayMonth(v.date) }),
      };
    case "NO_CLEAR_SCENE":
      return { title: t("mon_title_no_scene", lang), message: t("mon_no_scene", lang, { days: v.days }) };
    default:
      return { title: e.type, message: "" };
  }
}

/**
 * Same problem seen by two detectors → one event, keeping the more actionable
 * one and adding the other's evidence (raises confidence).
 *   IRRIGATION_CRITICAL absorbs WATER_STRESS; WATERLOG_SAR absorbs WEATHER_WATERLOG.
 */
const MERGE_INTO = { WATER_STRESS: "IRRIGATION_CRITICAL", WEATHER_WATERLOG: "WATERLOG_SAR" };

export function mergeDuplicates(candidates) {
  const byType = new Map(candidates.map((c) => [c.type, c]));
  const out = [];
  for (const c of candidates) {
    const target = byType.get(MERGE_INTO[c.type]);
    if (target) {
      target.evidence = [...(target.evidence || []), ...(c.evidence || [])];
      target.confidence = Number(Math.min(0.95, target.confidence + 0.1).toFixed(2));
      continue;
    }
    out.push(c);
  }
  return out;
}

/**
 * Several WhatsApp-worthy events in one run → one WhatsApp message (the most
 * severe) that says how many more are waiting in the app. The others still pop up.
 */
function bundleWhatsApp(events, lang, max) {
  const wa = events.filter((e) => e.notify.whatsapp);
  if (wa.length <= 1) return;
  const [first, ...rest] = wa;
  const more = t("mon_more_in_app", lang, { n: rest.length });
  first.whatsappParams[2] = sanitizeParam(`${first.message} ${more}`, Math.max(max, 300));
  for (const e of rest) {
    e.notify.whatsapp = false;
    e.whatsappBundledInto = first.key;
  }
}

/**
 * @param {object} input
 * @param {object} input.rules indexed rules
 * @param {Date}   input.now
 * @param {string} input.language
 * @param {object} input.crop  crop row from rules.findCrop()
 * @param {number} input.bbch
 * @param {object} input.s2  { NDVI: [{date,value}], NDRE, NDMI, EVI } cloud-filtered
 * @param {object[]} [input.s1] [{ date, vv, vh }]
 * @param {object} input.series daily weather series (features/weather.js)
 * @param {object} input.engine runRulesEngine() result for today
 * @param {object} input.history normalised history
 * @param {object|null} input.previous previous snapshot
 * @param {object[]} [input.openEvents]
 * @param {number} [input.whatsappSentToday]
 * @param {string} [input.fieldName]
 */
export function runConditionMonitor(input) {
  const { rules, now } = input;
  const lang = normalizeAdvisoryLanguage(input.language);
  const snapshot = buildConditionSnapshot(input);
  const snap = { ...snapshot, settings: rules.settings, crop: input.crop };

  const candidates = [];
  for (const detect of DETECTORS) {
    for (const c of detect(snap, input.previous || null)) {
      candidates.push(c);
      if (c.flag) snapshot.flags[c.flag] = true;
    }
  }
  const filtered = mergeDuplicates(candidates);

  const evaluated = {
    s2: Boolean(snapshot.s2.NDVI && !snapshot.s2.NDVI.stale),
    s1: Boolean(snapshot.s1 && !snapshot.s1.stale),
    weather: Boolean(input.series?.days?.length),
    water: snapshot.water.depletionMm !== null,
    stage: true,
    history: true,
  };

  const { upserts, resolved, quietHours } = reconcileEvents({
    candidates: filtered,
    openEvents: input.openEvents || [],
    evaluated,
    rules,
    now,
    whatsappSentToday: input.whatsappSentToday || 0,
    timeZone: input.timeZone,
  });

  const max = Number(rules.settings.whatsapp_param_max_chars) || 160;
  const field = input.fieldName || t("rk_wa_field", lang);
  const events = upserts.map((e) => {
    const text = renderEvent(e, { rules, lang, engine: input.engine });
    return {
      ...e,
      title: text.title,
      message: text.message,
      causesText: (e.causes || []).filter((c) => c.key !== "unknown").map((c) => causeText(c, rules, lang)),
      whatsappParams: [sanitizeParam(field, max), sanitizeParam(text.title, max), sanitizeParam(text.message, Math.max(max, 300))],
    };
  });

  bundleWhatsApp(events, lang, max);

  return {
    monitorVersion: MONITOR_VERSION,
    rulesVersion: rules.version,
    snapshot,
    evaluated,
    quietHours,
    events,
    resolved,
    popups: events.filter((e) => e.notify.popup),
    whatsapp: events.filter((e) => e.notify.whatsapp),
  };
}
