import {
  normalizeAdvisoryLanguage,
  needsLocalization,
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

function cleanText(v) {
  return String(v ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function firstText(...values) {
  for (const value of values) {
    const text = cleanText(value);
    if (text) return text;
  }
  return "";
}

function detailsContextByType(activity) {
  const type = String(activity?.type || "").toUpperCase();
  const d = activity?.details || {};

  if (type === "SPRAY") {
    const p0 = Array.isArray(d.products) ? d.products[0] : null;
    return firstText(
      p0?.name && p0?.dose ? `${p0.name} ${p0.dose}` : p0?.name,
      d?.timing,
      d?.method,
      d?.applicationMethod,
    );
  }

  if (type === "FERTIGATION") {
    const p0 = Array.isArray(d.products) ? d.products[0] : null;
    return firstText(
      p0?.name,
      d?.fertilizer,
      d?.quantity,
      d?.timing,
      d?.time,
      d?.method,
    );
  }

  if (type === "IRRIGATION") {
    return firstText(d?.duration, d?.waterQuantity, d?.frequency);
  }

  if (type === "WEATHER") {
    return firstText(d?.temperature, d?.rainfallProbability, d?.humidity);
  }

  if (type === "CROP_RISK") {
    return firstText(d?.riskLevel, d?.cause);
  }

  if (type === "MONITORING") {
    return firstText(d?.whatToCheck, d?.checks, d?.frequency);
  }

  if (type === "CARBON_TRACKING") {
    return firstText(d?.netBalance, d?.netBalanceKgCO2, d?.note);
  }

  return "";
}

function enrichActivityMessage(activity) {
  const baseMessage = cleanText(activity?.message);
  const context = detailsContextByType(activity);
  if (!baseMessage || !context) return activity;

  // Avoid duplicating context when message already contains it.
  if (baseMessage.toLowerCase().includes(context.toLowerCase())) {
    return { ...activity, message: truncate(baseMessage) };
  }

  return {
    ...activity,
    message: truncate(`${baseMessage} - ${context}`),
  };
}

function applyHintMessage(activity, hintMessage, { force = false, language = "en" } = {}) {
  if (!hintMessage) return activity;
  const msg = (activity.message || "").trim();
  const lang = normalizeAdvisoryLanguage(language);

  // Keep good localized LLM text; never overwrite with English hints
  if (lang !== "en" && msg.length > 12 && !needsLocalization(msg, lang)) {
    return activity;
  }

  if (lang !== "en" && needsLocalization(hintMessage, lang)) {
    return activity;
  }

  if (force || !msg) {
    return { ...activity, message: truncate(hintMessage) };
  }
  return activity;
}

function localizedSprayMessage(hints, lang) {
  const spray = hints?.spray;
  if (!spray) return t("no_spray", lang);
  if (spray.shouldSpray === false) {
    const reason = String(spray.reason || "");
    if (reason.includes("Organic")) return t("decision_organic_no_spray", lang);
    if (reason.includes("Wind") || reason.includes("rain")) {
      return t("decision_wind_rain_no_spray", lang);
    }
    if (reason.includes("stable") || reason.includes("No spray")) {
      return t("decision_stable_no_spray", lang);
    }
    if (reason.includes("Harvest")) return t("no_spray", lang);
    return t("no_spray", lang);
  }
  if (spray.hint?.message) {
    return needsLocalization(spray.hint.message, lang)
      ? t("decision_spray_choose", lang)
      : spray.hint.message;
  }
  return t("decision_stress_spray", lang);
}

function localizedFertigationMessage(hints, lang) {
  const fert = hints?.fertigation;
  if (!fert) return t("no_fertigation", lang);
  if (fert.shouldFertigate === false) {
    const reason = String(fert.reason || "");
    if (reason.includes("NPK") || reason.includes("baseline")) {
      return t("decision_npk_missing", lang);
    }
    if (reason.includes("BBCH") || reason.includes("window")) {
      return t("decision_no_fert_window", lang);
    }
    if (reason.includes("balanced")) return t("decision_nutrients_balanced", lang);
    if (reason.includes("Harvest")) return t("no_fertigation", lang);
    return t("no_fertigation", lang);
  }
  const h = fert.hint || {};
  if (h.fertilizer && h.quantity) {
    return t("apply_fertigation", lang, {
      fertilizer: h.fertilizer,
      quantity: h.quantity,
    });
  }
  const reason = String(fert.reason || "");
  if (reason.includes("Organic")) return t("decision_organic_fert", lang);
  if (reason.includes("Inorganic")) return t("decision_inorganic_fert", lang);
  if (reason.includes("Integrated")) return t("decision_integrated_fert", lang);
  const stageMatch = reason.match(/Apply (.+?) nutrients/i);
  if (stageMatch) {
    return t("decision_apply_stage_nutrients", lang, { stage: stageMatch[1] });
  }
  return reason || t("decision_apply_stage_nutrients", lang, { stage: "" });
}

function localizedIrrigationMessage(hints, evidence, lang) {
  const irr = hints?.irrigation;
  const req = evidence?.irrigationRequirement || {};
  if (!irr?.shouldIrrigate && !req.needsIrrigation) {
    const hintMsg = irr?.hint?.message || req.reason;
    if (hintMsg && !needsLocalization(hintMsg, lang)) {
      return hintMsg;
    }
    return t("no_irrigation", lang);
  }
  const hint = irr?.hint || {};
  if (hint.message && !needsLocalization(hint.message, lang)) {
    return hint.message;
  }
  if (req.amountHours) {
    return t("decision_irrigation_open", lang, { hours: req.amountHours });
  }
  if (req.amountMinutes) {
    return t("decision_irrigation_drip", lang, { minutes: req.amountMinutes });
  }
  return t("decision_check_soil_moisture", lang);
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
    const sprayMsg = localizedSprayMessage(hints, lang);
    if (hints.spray?.shouldSpray === false) {
      map.set(
        "SPRAY",
        applyHintMessage(spray, sprayMsg, { force: true, language: lang }),
      );
    } else if (hints.spray?.shouldSpray) {
      map.set("SPRAY", applyHintMessage(spray, sprayMsg, hintOpts));
    }
  }

  const fert = map.get("FERTIGATION");
  if (fert) {
    const fertMsg = localizedFertigationMessage(hints, lang);
    if (hints.fertigation?.shouldFertigate === false) {
      map.set(
        "FERTIGATION",
        applyHintMessage(fert, fertMsg, { force: true, language: lang }),
      );
    } else if (hints.fertigation?.shouldFertigate) {
      map.set("FERTIGATION", applyHintMessage(fert, fertMsg, hintOpts));
    }
  }

  const irr = map.get("IRRIGATION");
  if (irr) {
    const irrMsg = localizedIrrigationMessage(hints, evidence, lang);
    if (hints.irrigation?.shouldIrrigate === false && !evidence.irrigationRequirement?.needsIrrigation) {
      map.set(
        "IRRIGATION",
        applyHintMessage(irr, irrMsg, { force: true, language: lang }),
      );
    } else if (hints.irrigation?.shouldIrrigate || evidence.irrigationRequirement?.needsIrrigation) {
      map.set("IRRIGATION", applyHintMessage(irr, irrMsg, hintOpts));
    }
  }

  const mon = map.get("MONITORING");
  if (mon && hints.monitoring?.hint?.message) {
    const monMsg = needsLocalization(hints.monitoring.hint.message, lang)
      ? t("crop_monitor_default", lang, {
          checks: hints.monitoring.hint.checks || "leaves, soil moisture, pests",
        })
      : hints.monitoring.hint.message;
    map.set("MONITORING", applyHintMessage(mon, monMsg, hintOpts));
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
  ordered = ordered.map(enrichActivityMessage);

  return { activitiesToDo: ordered };
}
