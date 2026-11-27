import { t } from "../../utils/i18n/advisoryLocale.js";
import { buildRuleTag } from "../features/history.js";
import { formatDayMonth, pestName, productLabel } from "./text.js";

const ORDER = ["SPRAY", "FERTIGATION", "IRRIGATION", "WEATHER", "CROP_RISK", "MONITORING", "CARBON_TRACKING"];

function sprayTiming(timing, lang) {
  return timing === "evening" ? t("rk_time_spray_evening", lang) : t("rk_time_spray_morning", lang);
}

export function buildSprayActivity({ spray, rules, lang }) {
  const top = spray.top;
  const pest = top ? pestName(top.targetId, rules, lang) : "";
  const product = spray.product;
  const vars = {
    pest,
    product: product?.name || "",
    dose: product?.dose || "",
    timing: sprayTiming(spray.timing, lang),
  };
  let key = "rk_spray_none";
  switch (spray.action) {
    case "NOT_APPLICABLE":
      key = "rk_spray_indoor";
      break;
    case "SPRAY":
      key = "rk_spray_now";
      break;
    case "WAIT":
      key = spray.nextSprayDate ? "rk_spray_wait" : "rk_spray_wait_nodate";
      vars.blocker = t(spray.blockers.includes("rain") ? "rk_block_rain" : "rk_block_wind", lang);
      vars.date = formatDayMonth(spray.nextSprayDate);
      break;
    case "MONITOR":
      key = product ? "rk_spray_monitor_product" : "rk_spray_monitor";
      break;
    case "RECENTLY_TREATED":
      key = "rk_spray_recent";
      vars.date = formatDayMonth(spray.lastSprayDate);
      break;
    case "CONSULT":
      key = "rk_spray_consult";
      break;
    case "HARVEST_NO_CHEMICAL":
      key = "rk_spray_harvest";
      break;
    default:
      key = spray.reasonCodes?.includes("weather_missing") ? "rk_spray_no_weather" : "rk_spray_none";
  }

  const products = [product, ...(spray.alternatives || [])].filter(Boolean).map((p) => ({
    productId: p.id,
    name: p.name,
    dose: p.dose,
    group: p.group,
    kind: p.kind,
    note: p.note || undefined,
    brands: p.brands?.length ? p.brands : undefined,
    phiDays: p.phiDays ?? undefined,
  }));
  const actionable = ["SPRAY", "WAIT", "MONITOR", "CONSULT"].includes(spray.action);
  const ruleTag = top
    ? buildRuleTag({ rule: top.ruleId, tgt: top.targetId, grp: product?.group, prd: product?.id })
    : "";

  return {
    type: "SPRAY",
    title: t(actionable ? "title_spray_advisory" : "title_spray", lang),
    message: t(key, lang, vars),
    details: {
      engineAction: spray.action,
      riskLevel: top?.risk || "LOW",
      pestId: top?.targetId || null,
      pest: pest || null,
      ruleId: top?.ruleId || null,
      products: actionable ? products : [],
      applicationMethod: top?.target?.method || undefined,
      timing: actionable ? vars.timing : undefined,
      nextSprayDate: spray.nextSprayDate || undefined,
      // Operations calendar places the task on this day (syncAdvisoryToOperations).
      scheduledDate: spray.action === "WAIT" ? spray.nextSprayDate || undefined : undefined,
      whatToCheck: top?.target?.scout || undefined,
      actionThreshold: top?.target?.etl || undefined,
      cropNote: top?.note || undefined,
      notes: actionable
        ? [t("spray_note_one_option", lang), t("spray_note_label", lang), t("spray_note_ppe", lang)]
        : undefined,
      otherRisks: (spray.risks || [])
        .filter((r) => r !== top && (r.risk === "HIGH" || r.risk === "MODERATE"))
        .slice(0, 3)
        .map((r) => ({ pestId: r.targetId, pest: pestName(r.targetId, rules, lang), riskLevel: r.risk })),
      ruleTag: ruleTag || undefined,
      recommendedAction: actionable ? undefined : t("detail_recommended_none", lang),
    },
  };
}

function irrigationTiming(timing, lang) {
  if (timing === "evening") return t("rk_time_irr_evening", lang);
  if (timing === "night") return t("rk_time_irr_night", lang);
  return t("rk_time_irr_morning", lang);
}

export function buildIrrigationActivity({ irrigation, lang }) {
  const i = irrigation;
  const vars = {
    rain: Math.round(i.action === "DRAIN" ? i.rain3dMm ?? 0 : i.rainTodayMm ?? 0),
    mm: i.grossMm ?? i.amountMm ?? 0,
    minutes: i.minutes ?? 0,
    hours: i.hours ?? 0,
    litres: i.litresPerPlant ?? 0,
    timing: irrigationTiming(i.timing, lang),
    days: i.nextCheckDays ?? 3,
    tmax: Math.round(i.tmax ?? 0),
    tmin: Math.round(i.tmin ?? 0),
  };
  let key;
  switch (i.action) {
    case "NOT_APPLICABLE":
      key = "rk_irr_indoor";
      break;
    case "SKIP_RAIN":
      key = "rk_irr_skip_rain";
      break;
    case "DRAIN":
      key = "rk_irr_drain";
      break;
    case "STOP_HARVEST":
      key = "rk_irr_stop_harvest";
      break;
    case "IRRIGATE":
      if (i.family === "drip") key = i.litresPerPlant ? "rk_irr_drip_plant" : "rk_irr_drip";
      else if (i.family === "sprinkler") key = "rk_irr_sprinkler";
      else key = i.hours ? "rk_irr_flood_hours" : "rk_irr_flood";
      break;
    case "PROTECTIVE":
      key = "rk_irr_protective";
      break;
    case "CONSERVE":
      key = "rk_irr_conserve";
      break;
    case "POSTPONE_RAIN":
      key = "rk_irr_postpone";
      vars.rain = i.rainNext2Mm ?? 0;
      break;
    case "LIGHT_HEAT":
      key = "rk_irr_light_heat";
      break;
    case "LIGHT_FROST":
      key = "rk_irr_light_frost";
      break;
    case "MAINTAIN":
      key = "rk_irr_drip_maintain";
      break;
    case "CHECK_MOISTURE":
      key = "rk_irr_check";
      break;
    default:
      key = i.family === "rainfed" ? "rk_irr_rainfed_ok" : i.nextCheckDays ? "rk_irr_none" : "no_irrigation";
  }
  let message = t(key, lang, vars);
  const coreMessage = message;
  if (i.action === "IRRIGATE" && i.critical) message = `${message} ${t("rk_irr_critical_suffix", lang)}`;
  if (i.action === "IRRIGATE" && i.splitAcrossDays) message = `${message} ${t("rk_irr_split_suffix", lang)}`;

  const irrigating = ["IRRIGATE", "MAINTAIN", "PROTECTIVE", "LIGHT_HEAT", "LIGHT_FROST"].includes(i.action);
  return {
    type: "IRRIGATION",
    title: t("title_irrigation", lang),
    message,
    details: {
      engineAction: i.action,
      coreMessage,
      shouldIrrigate: irrigating,
      applicationMethod: i.method || undefined,
      timing: irrigating ? vars.timing : undefined,
      duration:
        i.minutes ? t("detail_duration_minutes", lang, { minutes: i.minutes })
          : i.hours ? t("detail_duration_hours", lang, { hours: i.hours })
            : undefined,
      waterQuantity: irrigating && vars.mm ? `${vars.mm} mm` : undefined,
      litresPerPlant: i.litresPerPlant || undefined,
      soil: i.soil,
      soilAssumed: i.soilAssumed || undefined,
      criticalStage: i.critical,
      depletionMm: i.depletionMm,
      readilyAvailableWaterMm: i.rawMm,
      depletionSource: i.depletionSource || undefined,
      cropWaterUseMmPerDay: i.etcMmPerDay,
      rateSource: i.rateSource || undefined,
      nextCheckDays: i.nextCheckDays || undefined,
    },
  };
}

export function buildFertilizerActivity({ fertilizer, baseActivity, lang }) {
  const base = baseActivity || { type: "FERTIGATION", title: t("title_fertigation", lang), message: t("no_fertigation", lang), details: {} };
  const ruleTag = fertilizer.windowKey ? buildRuleTag({ win: fertilizer.windowKey }) : "";
  if (fertilizer.action === "ALREADY_APPLIED") {
    return {
      ...base,
      message: t("rk_fert_already", lang, { date: formatDayMonth(fertilizer.appliedOn) }),
      details: { engineAction: fertilizer.action, appliedOn: fertilizer.appliedOn, windowKey: fertilizer.windowKey, recommendedAction: t("detail_recommended_none", lang) },
    };
  }
  return {
    ...base,
    details: { ...(base.details || {}), engineAction: fertilizer.action, windowKey: fertilizer.windowKey || undefined, ruleTag: ruleTag || undefined },
  };
}

function buildMonitoringActivity({ spray, baseActivity, rules, lang }) {
  const base = baseActivity || { type: "MONITORING", title: t("title_monitoring_crop", lang), message: t("crop_monitor_default", lang, { checks: t("detail_monitor_checks", lang) }), details: {} };
  const watch = (spray.risks || []).filter((r) => r.risk === "HIGH" || r.risk === "MODERATE").slice(0, 2);
  if (!watch.length) return base;
  const pests = watch.map((r) => pestName(r.targetId, rules, lang)).join(", ");
  return {
    ...base,
    message: `${t("rk_monitor_pest", lang, { pest: pests })} ${base.message || ""}`.trim(),
    details: {
      ...(base.details || {}),
      watchFor: watch.map((r) => ({ pestId: r.targetId, pest: pestName(r.targetId, rules, lang), signs: r.target.scout, actionThreshold: r.target.etl, riskLevel: r.risk })),
    },
  };
}

/**
 * Produce the 7 app activities. WEATHER / CROP_RISK / CARBON_TRACKING come from the
 * existing rule-based builder (`baseActivities`); SPRAY / IRRIGATION / FERTIGATION /
 * MONITORING come from the engine decisions.
 */
export function buildEngineActivities({ decisions, baseActivities = [], rules, lang }) {
  const base = new Map(baseActivities.filter((a) => a?.type).map((a) => [a.type, a]));
  const built = {
    SPRAY: buildSprayActivity({ spray: decisions.spray, rules, lang }),
    FERTIGATION: buildFertilizerActivity({ fertilizer: decisions.fertilizer, baseActivity: base.get("FERTIGATION"), lang }),
    IRRIGATION: buildIrrigationActivity({ irrigation: decisions.irrigation, lang }),
    MONITORING: buildMonitoringActivity({ spray: decisions.spray, baseActivity: base.get("MONITORING"), rules, lang }),
  };
  return ORDER.map((type) => built[type] || base.get(type) || { type, title: type, message: t("notif_no_details", lang), details: {} });
}
