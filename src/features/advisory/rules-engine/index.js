/**
 * CropGen deterministic advisory engine.
 *
 * Same inputs → same advice, every decision traceable to a workbook row
 * (rule id, product id, setting). No LLM is used to decide anything.
 */
import { loadRules } from "./rulesStore.js";
import { buildDailySeries } from "./features/weather.js";
import { emptyHistory } from "./features/history.js";
import { decideSpray, normalizeFarmingType } from "./engines/spray.js";
import { decideIrrigation } from "./engines/irrigation.js";
import { decideFertilizer } from "./engines/fertilizer.js";
import { evaluateAlerts } from "./engines/alerts.js";
import { buildEngineActivities } from "./output/activities.js";
import { buildWhatsAppPayloads } from "./output/whatsapp.js";
import { normalizeAdvisoryLanguage } from "../utils/i18n/advisoryLanguages.js";

export { loadRules } from "./rulesStore.js";
export { normalizeHistory, buildRuleTag } from "./features/history.js";

/** State / province code (e.g. "MH", "WC"); used for region-wise products and pest presence. */
function resolveRegion(farm) {
  const raw = farm?.state || farm?.region || farm?.regionProfile?.state || farm?.regionProfile?.stateCode || "";
  return String(raw).trim().toUpperCase() || null;
}

function resolveCountry(farm, user, settings) {
  const raw = farm?.country || user?.country || user?.countryCode || process.env.ADVISORY_DEFAULT_COUNTRY || settings.default_country || "IN";
  return String(raw).trim().toUpperCase().slice(0, 2);
}

/**
 * @param {object} input
 * @param {Date}   [input.now]
 * @param {string} input.language
 * @param {object} input.farm   { cropName, fieldName, acre, typeOfFarming, typeOfIrrigation, irrigationFamily,
 *                                soilType, country, waterSource, irrigationDetails }
 * @param {object} input.crop   { bbchStage, stageName }
 * @param {object} input.weather { weatherSummary, historical }
 * @param {object} [input.satellite]
 * @param {object} [input.fertilizer] { baseDecision, windowKey }
 * @param {object} [input.history] normalised history (features/history.js)
 * @param {object} [input.user] { firstName, country }
 * @param {object[]} [input.baseActivities] legacy rule-based activities (WEATHER, CROP_RISK, CARBON…)
 * @param {object} [input.rules] indexed rules (defaults to bundled JSON)
 */
export function runRulesEngine(input) {
  const rules = input.rules || loadRules();
  const now = input.now instanceof Date ? input.now : new Date();
  const todayISO = now.toISOString().slice(0, 10);
  const lang = normalizeAdvisoryLanguage(input.language);
  const history = input.history || emptyHistory();
  const farm = input.farm || {};
  const crop = rules.findCrop(farm.cropName);
  const bbch = Number(input.crop?.bbchStage) || 0;
  const farmingType = normalizeFarmingType(farm.typeOfFarming);
  const family = input.farm?.irrigationFamily || "drip";
  const country = resolveCountry(farm, input.user, rules.settings);
  const region = resolveRegion(farm);

  const dataQuality = [];
  if (!crop) dataQuality.push("crop_not_in_rulebook");
  const series = buildDailySeries({
    historical: input.weather?.historical,
    weatherSummary: input.weather?.weatherSummary,
    todayISO,
  });
  if (!series.hasPast) dataQuality.push("no_past_weather");
  if (series.days[series.todayIndex]?.rh === null) dataQuality.push("no_humidity_today");

  const spray = decideSpray({ rules, crop, bbch, farmingType, country, region, series, history, todayISO });
  const irrigation = decideIrrigation({
    rules,
    crop,
    bbch,
    family,
    irrigationType: farm.typeOfIrrigation,
    farm,
    series,
    history,
    sowingISO: input.crop?.sowingDate ? String(input.crop.sowingDate).slice(0, 10) : null,
  });
  const fertilizer = decideFertilizer({
    baseDecision: input.fertilizer?.baseDecision,
    windowKey: input.fertilizer?.windowKey,
    history,
    todayISO,
    settings: rules.settings,
  });
  const alerts = evaluateAlerts({
    rules,
    crop,
    bbch,
    family,
    series,
    spray,
    irrigation,
    satellite: input.satellite,
    history,
    now,
  });

  const decisions = { spray, irrigation, fertilizer, alerts };
  const activitiesToDo = buildEngineActivities({
    decisions,
    baseActivities: input.baseActivities,
    rules,
    lang,
  });
  const whatsapp = buildWhatsAppPayloads({
    decisions,
    activities: activitiesToDo,
    rules,
    lang,
    user: input.user,
    farm,
    cropName: crop?.name || farm.cropName || "",
  });

  return {
    engine: "rules",
    rulesVersion: rules.version,
    liveStatuses: rules.liveStatuses,
    country,
    region,
    farmingType,
    cropKey: crop?.key || null,
    dataQuality,
    decisions: compactDecisions(decisions),
    alerts: alerts.map((a) => ({ alertId: a.alertId, severity: a.severity, sentAt: a.sentAt, vars: a.vars })),
    activitiesToDo,
    whatsapp,
  };
}

/** Strip heavy objects (full target rows) before persisting on FarmAdvisory. */
function compactDecisions({ spray, irrigation, fertilizer, alerts }) {
  const risk = (r) => r && {
    ruleId: r.ruleId,
    targetId: r.targetId,
    risk: r.risk,
    consecutiveDays: r.consecutiveDays,
    matchingDays: r.matchingDays,
    evaluatedDays: r.evaluatedDays,
  };
  return {
    spray: {
      action: spray.action,
      top: risk(spray.top),
      risks: (spray.risks || []).map(risk),
      productId: spray.product?.id || null,
      alternativeIds: (spray.alternatives || []).map((p) => p.id),
      blockers: spray.blockers || [],
      timing: spray.timing || null,
      nextSprayDate: spray.nextSprayDate || null,
      lastSprayDate: spray.lastSprayDate || null,
      nearHarvest: Boolean(spray.nearHarvest),
      reasonCodes: spray.reasonCodes || [],
    },
    irrigation,
    fertilizer: {
      action: fertilizer.action,
      windowKey: fertilizer.windowKey,
      appliedOn: fertilizer.appliedOn || null,
      notifyWhatsApp: Boolean(fertilizer.notifyWhatsApp),
      notifiedWindowKey: fertilizer.notifiedWindowKey || null,
      reasonCodes: fertilizer.reasonCodes || [],
    },
    alerts: alerts.map((a) => ({ alertId: a.alertId, severity: a.severity, vars: a.vars })),
  };
}
