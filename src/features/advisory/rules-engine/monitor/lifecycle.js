/**
 * Event lifecycle: merge newly detected candidates with the field's open
 * events, decide what to notify (popup / WhatsApp), and resolve events whose
 * condition has cleared.
 *
 *   open ──(farmer taps "seen")──▶ acknowledged
 *    │                                  │
 *    └──── condition cleared / expired ─┴──▶ resolved
 */
import { SEVERITY_RANK, maxSeverity } from "./detectors.js";

/** Which data source a type depends on: only resolve it when that source was evaluated this run. */
const SOURCE_OF = {
  VEG_DROP: "s2",
  VEG_BELOW_EXPECTED: "s2",
  WATER_STRESS: "water",
  N_STRESS: "s2",
  WATERLOG_SAR: "s1",
  CANOPY_LOSS_SAR: "s1",
  STAGE_CHANGE: "stage",
  GROWTH_DELAY: "stage",
  PEST_RISK: "weather",
  IRRIGATION_CRITICAL: "water",
  TASK_OVERDUE: "history",
  NO_CLEAR_SCENE: "s2",
};

export const DEFAULT_MONITORING_RULES = {
  VEG_DROP: { kind: "point", channels: "popup+whatsapp", cooldownHours: 120, expiresDays: 10 },
  VEG_BELOW_EXPECTED: { kind: "state", channels: "popup", cooldownHours: 168, expiresDays: 21 },
  WATER_STRESS: { kind: "state", channels: "popup+whatsapp", cooldownHours: 48, expiresDays: 7 },
  N_STRESS: { kind: "state", channels: "popup", cooldownHours: 168, expiresDays: 14 },
  WATERLOG_SAR: { kind: "state", channels: "popup+whatsapp", cooldownHours: 48, expiresDays: 7 },
  CANOPY_LOSS_SAR: { kind: "point", channels: "popup+whatsapp", cooldownHours: 168, expiresDays: 10 },
  STAGE_CHANGE: { kind: "point", channels: "popup", cooldownHours: 0, expiresDays: 5 },
  GROWTH_DELAY: { kind: "state", channels: "popup", cooldownHours: 168, expiresDays: 21 },
  PEST_RISK: { kind: "state", channels: "popup+whatsapp", cooldownHours: 72, expiresDays: 7 },
  IRRIGATION_CRITICAL: { kind: "state", channels: "popup+whatsapp", cooldownHours: 24, expiresDays: 3 },
  TASK_OVERDUE: { kind: "state", channels: "popup", cooldownHours: 48, expiresDays: 7 },
  NO_CLEAR_SCENE: { kind: "state", channels: "none", cooldownHours: 0, expiresDays: 30 },
  WEATHER_HEAVY_RAIN: { kind: "point", channels: "popup+whatsapp", cooldownHours: 24, expiresDays: 3 },
  WEATHER_HEAT: { kind: "point", channels: "popup+whatsapp", cooldownHours: 48, expiresDays: 3 },
  WEATHER_FROST: { kind: "point", channels: "popup+whatsapp", cooldownHours: 48, expiresDays: 2 },
  WEATHER_WIND: { kind: "point", channels: "popup+whatsapp", cooldownHours: 24, expiresDays: 2 },
  WEATHER_DRY_SPELL: { kind: "state", channels: "popup+whatsapp", cooldownHours: 96, expiresDays: 10 },
  WEATHER_WATERLOG: { kind: "point", channels: "popup+whatsapp", cooldownHours: 48, expiresDays: 3 },
};

function ruleFor(rules, type) {
  const fromSheet = rules.monitoring?.[type];
  const base = DEFAULT_MONITORING_RULES[type] || { kind: "point", channels: "popup", cooldownHours: 48, expiresDays: 7 };
  return { active: true, ...base, ...(fromSheet || {}) };
}

function hoursSince(iso, now) {
  if (!iso) return Infinity;
  return (now.getTime() - new Date(iso).getTime()) / 3600000;
}

function localHour(now, timeZone) {
  try {
    return Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone }).format(now)) % 24;
  } catch {
    return now.getUTCHours();
  }
}

/**
 * @param {object} p
 * @param {object[]} p.candidates  detector output
 * @param {object[]} p.openEvents  stored events with status open|acknowledged
 * @param {object} p.evaluated     { s2, s1, weather, water, stage, history } booleans for this run
 * @param {object} p.rules         indexed rules (settings + monitoring)
 * @param {Date}   p.now
 * @param {number} [p.whatsappSentToday] already sent today for this field
 * @param {string} [p.timeZone]
 */
export function reconcileEvents({ candidates, openEvents = [], evaluated = {}, rules, now, whatsappSentToday = 0, timeZone }) {
  const s = rules.settings;
  const nowISO = now.toISOString();
  const openByKey = new Map(openEvents.filter((e) => e.status !== "resolved").map((e) => [e.key, e]));
  const seen = new Set();
  const upserts = [];

  for (const c of candidates) {
    const rule = ruleFor(rules, c.type);
    if (rule.active === false) continue;
    seen.add(c.key);
    const existing = openByKey.get(c.key);
    const severity = existing ? maxSeverity(existing.severity, c.severity) : c.severity;
    const escalated = existing && SEVERITY_RANK[c.severity] > SEVERITY_RANK[existing.notifiedSeverity || existing.severity];
    const cooledDown = existing && existing.status !== "acknowledged" && hoursSince(existing.lastNotifiedAt, now) >= rule.cooldownHours && rule.cooldownHours > 0;
    const wantsNotify = rule.channels !== "none" && (!existing || escalated || cooledDown);

    upserts.push({
      ...c,
      severity,
      status: existing?.status || "open",
      firstSeenAt: existing?.firstSeenAt || nowISO,
      lastSeenAt: nowISO,
      expiresAt: new Date(now.getTime() + (rule.expiresDays || 7) * 86400000).toISOString(),
      isNew: !existing,
      escalated: Boolean(escalated),
      channels: rule.channels,
      notify: { popup: wantsNotify && rule.channels.includes("popup"), whatsapp: false },
      // WhatsApp held back earlier (quiet hours / daily cap) is retried while the event is open.
      whatsappPending: Boolean(existing?.whatsappPending) && existing?.status !== "acknowledged",
      eventId: existing?.eventId || existing?._id || null,
    });
  }

  // WhatsApp: High-priority first, within the daily cap, outside quiet hours.
  const minRank = SEVERITY_RANK[s.mon_whatsapp_min_severity || "High"] ?? 3;
  const hour = localHour(now, timeZone || process.env.ADVISORY_TZ || "Asia/Kolkata");
  const quiet = hour >= Number(s.mon_quiet_start_hour ?? 21) || hour < Number(s.mon_quiet_end_hour ?? 6);
  // The cap counts MESSAGES: everything eligible in one run is bundled into one
  // WhatsApp (index.js bundleWhatsApp), so a run uses at most one unit of budget.
  const budget = Math.max(0, Number(s.mon_whatsapp_daily_cap ?? 3) - whatsappSentToday);
  const ordered = [...upserts].sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] || b.confidence - a.confidence);
  for (const e of ordered) {
    if (!(e.notify.popup || e.whatsappPending) || !e.channels.includes("whatsapp")) continue;
    if (SEVERITY_RANK[e.severity] < minRank) {
      e.whatsappPending = false;
      continue;
    }
    if (quiet || budget <= 0) {
      e.whatsappPending = true;
      continue;
    }
    e.notify.whatsapp = true;
    e.whatsappPending = false;
  }

  // Resolve: state events whose source was evaluated and no longer detected;
  // any event past its expiry.
  const resolved = [];
  for (const e of openByKey.values()) {
    if (seen.has(e.key)) continue;
    const rule = ruleFor(rules, e.type);
    const source = SOURCE_OF[e.type] || (e.type.startsWith("WEATHER_") ? "weather" : null);
    const expired = e.expiresAt && new Date(e.expiresAt) <= now;
    const cleared = rule.kind === "state" && source && evaluated[source];
    if (expired || cleared) {
      resolved.push({ key: e.key, eventId: e.eventId || e._id || null, reason: expired ? "expired" : "condition_cleared", resolvedAt: nowISO });
    }
  }

  return { upserts, resolved, quietHours: quiet };
}
