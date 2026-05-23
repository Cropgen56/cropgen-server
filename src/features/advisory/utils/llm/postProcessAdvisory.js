import {
  normalizeAdvisoryLanguage,
  t,
} from "../i18n/advisoryLocale.js";

const REQUIRED_TYPES = [
  "SPRAY",
  "FERTIGATION",
  "IRRIGATION",
  "WEATHER",
  "CROP_RISK",
  "MONITORING",
  "CARBON_TRACKING",
];

const WHATSAPP_MAX = 280;

function truncate(text, max = WHATSAPP_MAX) {
  if (!text || typeof text !== "string") return text || "";
  const trimmed = text.trim();
  return trimmed.length <= max ? trimmed : `${trimmed.slice(0, max - 3)}...`;
}

function applyHintMessage(activity, hintMessage, { force = false, language = "en" } = {}) {
  if (!hintMessage) return activity;
  const msg = (activity.message || "").trim();
  const lang = normalizeAdvisoryLanguage(language);

  // Never replace Hindi/Marathi LLM text with English agronomist hints
  if (lang !== "en" && msg.length > 12) {
    return activity;
  }

  if (force || !msg) {
    return { ...activity, message: truncate(hintMessage) };
  }
  return activity;
}

/**
 * Align LLM output with agronomist decision hints (safety net).
 */
export function enforceDecisionHints(activities, evidence) {
  const hints = evidence?.decisionHints;
  if (!hints || !Array.isArray(activities)) return activities;

  const lang = normalizeAdvisoryLanguage(evidence?.language);
  const map = new Map(activities.map((a) => [a.type, { ...a }]));
  const hintOpts = { language: lang };

  const spray = map.get("SPRAY");
  if (spray) {
    if (hints.spray?.shouldSpray === false) {
      map.set(
        "SPRAY",
        applyHintMessage(
          spray,
          hints.spray.reason || t("no_spray", lang),
          { force: true, language: lang },
        ),
      );
    } else if (hints.spray?.shouldSpray && hints.spray?.hint?.message) {
      map.set(
        "SPRAY",
        applyHintMessage(spray, hints.spray.hint.message, hintOpts),
      );
    }
  }

  const fert = map.get("FERTIGATION");
  if (fert) {
    if (hints.fertigation?.shouldFertigate === false) {
      map.set(
        "FERTIGATION",
        applyHintMessage(
          fert,
          hints.fertigation.reason || t("no_fertigation", lang),
          { force: true, language: lang },
        ),
      );
    } else if (hints.fertigation?.shouldFertigate && hints.fertigation?.hint) {
      const h = hints.fertigation.hint;
      const msg =
        h.fertilizer && h.quantity
          ? t("apply_fertigation", lang, {
              fertilizer: h.fertilizer,
              quantity: h.quantity,
            })
          : hints.fertigation.reason;
      map.set("FERTIGATION", applyHintMessage(fert, msg, hintOpts));
    }
  }

  const irr = map.get("IRRIGATION");
  if (irr) {
    if (hints.irrigation?.shouldIrrigate === false) {
      map.set(
        "IRRIGATION",
        applyHintMessage(
          irr,
          hints.irrigation.hint?.message ||
            evidence.irrigationRequirement?.reason ||
            t("no_irrigation", lang),
          { force: true, language: lang },
        ),
      );
    } else if (hints.irrigation?.shouldIrrigate && hints.irrigation?.hint?.message) {
      map.set(
        "IRRIGATION",
        applyHintMessage(irr, hints.irrigation.hint.message, hintOpts),
      );
    }
  }

  const mon = map.get("MONITORING");
  if (mon && hints.monitoring?.hint?.message) {
    map.set(
      "MONITORING",
      applyHintMessage(mon, hints.monitoring.hint.message, hintOpts),
    );
  }

  return REQUIRED_TYPES.map((type) => map.get(type)).filter(Boolean);
}

export function postProcessAdvisory(llmOutput, evidence) {
  const activities = llmOutput?.activitiesToDo ?? [];
  const activityMap = new Map();
  activities.forEach((a) => {
    if (a?.type) activityMap.set(a.type, a);
  });

  REQUIRED_TYPES.forEach((type) => {
    if (!activityMap.has(type)) {
      activityMap.set(type, { type, title: type, message: "", details: {} });
    } else {
      const act = activityMap.get(type);
      activityMap.set(type, {
        ...act,
        title: typeof act.title === "string" ? act.title : type,
        message: truncate(act.message),
        details: act.details && typeof act.details === "object" ? act.details : {},
      });
    }
  });

  let ordered = REQUIRED_TYPES.map((type) => activityMap.get(type));
  ordered = enforceDecisionHints(ordered, evidence);

  return { activitiesToDo: ordered };
}
