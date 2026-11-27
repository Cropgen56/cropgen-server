import { addDays, dayAt } from "../features/weather.js";
import { isNearHarvestForSpray } from "../features/cropStage.js";
import { normalizeTypeOfFarming } from "../../utils/shared/farmingTypeNormalize.js";

const ROTATION_EXEMPT = /^(bio|botanical|cultural|trap|physical|mineral)$/i;
const RISK_ORDER = { HIGH: 3, MODERATE: 2, LOW: 1, UNKNOWN: 0 };

/** Same mapping as the rest of the advisory code (unknown → Integrated). */
export const normalizeFarmingType = normalizeTypeOfFarming;

function rain3(series, index) {
  let sum = 0;
  let seen = 0;
  for (let i = index - 2; i <= index; i++) {
    const r = series.days[i]?.rain;
    if (r !== null && r !== undefined) {
      sum += r;
      seen++;
    }
  }
  return seen ? sum : null;
}

/** Evaluate one target's weather window. */
export function evaluateTrigger(target, series, settings) {
  const from = Math.max(0, series.todayIndex - settings.spray_window_past_days);
  const to = Math.min(series.days.length - 1, series.todayIndex + settings.spray_window_future_days);
  let run = 0;
  let bestRun = 0;
  let matches = 0;
  let evaluated = 0;
  let firstMatchDate = null;

  for (let i = from; i <= to; i++) {
    const d = series.days[i];
    const temp = d.tmean ?? (d.tmax !== null && d.tmin !== null ? (d.tmax + d.tmin) / 2 : null);
    if (temp === null || d.rh === null) {
      run = 0;
      continue;
    }
    evaluated++;
    const r3 = rain3(series, i);
    let rainOk = true;
    if (target.rain === "wet") rainOk = r3 !== null && r3 >= target.rainMm;
    if (target.rain === "dry") rainOk = r3 === null || r3 < target.rainMm;
    const ok =
      temp >= target.tmin && temp <= target.tmax && d.rh >= target.rhmin && d.rh <= target.rhmax && rainOk;
    if (ok) {
      matches++;
      run++;
      bestRun = Math.max(bestRun, run);
      if (!firstMatchDate) firstMatchDate = d.date;
    } else {
      run = 0;
    }
  }

  let risk = "LOW";
  if (!evaluated) risk = "UNKNOWN";
  else if (bestRun >= target.days) risk = "HIGH";
  else if (matches > 0) risk = "MODERATE";
  return { risk, consecutiveDays: bestRun, matchingDays: matches, evaluatedDays: evaluated, firstMatchDate };
}

function daysBetween(aISO, bISO) {
  return Math.round((new Date(`${bISO}T12:00:00Z`) - new Date(`${aISO}T12:00:00Z`)) / 86400000);
}

function kindRank(kind, farmingType, risk) {
  const chemical = kind === "Chemical";
  if (farmingType === "Inorganic") return chemical ? 0 : 1;
  if (farmingType === "Integrated") return risk === "HIGH" ? (chemical ? 0 : 1) : chemical ? 1 : 0;
  return 0;
}

/**
 * Choose products for a target honoring farming type, country/region registration,
 * harvest safety and FRAC/IRAC rotation.
 *
 * Registration: if the Product Registrations tab has ANY live row for this
 * country + crop, only products registered there (and for this region) are used,
 * with the label dose of that country. Otherwise the product's country list applies
 * and the choice is flagged "registration not verified".
 */
export function selectProducts({ rules, targetId, farmingType, country, region, cropKey, risk, nearHarvest, recentGroups }) {
  const regs = rules.registrationsFor ? rules.registrationsFor(country, cropKey) : [];
  let list = rules.productsFor(targetId).filter((p) => p.farmingTypes.includes(farmingType));
  let registrationVerified = false;
  if (regs.length) {
    const byProduct = new Map();
    for (const r of regs) {
      if (r.regions.includes("ALL") || (region && r.regions.includes(region))) byProduct.set(r.productId, r);
    }
    list = list
      .filter((p) => byProduct.has(p.id) || p.kind === "Cultural")
      .map((p) => {
        const r = byProduct.get(p.id);
        return r ? { ...p, dose: r.dose || p.dose, phiDays: r.phiDays ?? null, brands: r.brands || [], registration: r.source || null } : p;
      });
    registrationVerified = true;
  } else {
    list = list.filter(
      (p) =>
        (p.countries.includes("ALL") || p.countries.includes(country)) &&
        (!p.regions?.length || p.regions.includes("ALL") || (region && p.regions.includes(region))),
    );
  }
  if (farmingType === "Organic") list = list.filter((p) => p.kind !== "Chemical");
  if (nearHarvest) list = list.filter((p) => p.kind !== "Chemical");

  const recent = new Set(recentGroups || []);
  const rotationPenalty = (p) => (recent.has(p.group) && !ROTATION_EXEMPT.test(p.group) ? 1 : 0);

  const sorted = [...list].sort(
    (a, b) =>
      kindRank(a.kind, farmingType, risk) - kindRank(b.kind, farmingType, risk) ||
      rotationPenalty(a) - rotationPenalty(b) ||
      a.preference - b.preference,
  );
  const rotated = sorted.length > 0 && rotationPenalty(sorted[0]) === 0 && list.some((p) => rotationPenalty(p));
  return { products: sorted, rotationApplied: rotated, registrationVerified };
}

function nextSprayableDay(series, settings) {
  for (let o = 1; o <= 6; o++) {
    const d = dayAt(series, o);
    if (!d) break;
    const rainOk = d.rain === null || d.rain < settings.spray_rain_block_mm;
    const windOk = d.wind === null || d.wind <= settings.spray_max_wind_kmh;
    if (rainOk && windOk) return d.date;
  }
  return null;
}

/**
 * @returns {{ action: string, top: object|null, risks: object[], blockers: string[], timing: string, ... }}
 * action: NONE | SPRAY | WAIT | MONITOR | RECENTLY_TREATED | CONSULT | NOT_APPLICABLE | HARVEST_NO_CHEMICAL
 */
export function decideSpray({ rules, crop, bbch, farmingType, country, region, series, history, todayISO }) {
  const s = rules.settings;
  if (!crop || crop.indoor) {
    return { action: "NOT_APPLICABLE", top: null, risks: [], blockers: [], reasonCodes: ["indoor_or_unknown_crop"] };
  }

  const nearHarvest = isNearHarvestForSpray(crop, bbch, s);
  const risks = [];
  const month = Number(String(todayISO).slice(5, 7));
  for (const rule of rules.sprayRulesFor(crop.key)) {
    if (bbch < rule.bbchMin || bbch > rule.bbchMax) continue;
    if (rules.pestPresent && !rules.pestPresent(rule.targetId, country, region, month)) continue;
    const target = rules.targets[rule.targetId];
    const ev = evaluateTrigger(target, series, s);
    risks.push({ ruleId: rule.id, targetId: target.id, target, note: rule.note, ...ev });
  }
  risks.sort(
    (a, b) =>
      RISK_ORDER[b.risk] - RISK_ORDER[a.risk] ||
      b.consecutiveDays - a.consecutiveDays ||
      b.matchingDays - a.matchingDays,
  );

  const reasonCodes = [];
  const actionable = risks.filter((r) => r.risk === "HIGH" || r.risk === "MODERATE");
  if (!risks.length) reasonCodes.push("no_live_rules_for_stage");
  if (risks.length && risks.every((r) => r.risk === "UNKNOWN")) reasonCodes.push("weather_missing");
  if (!actionable.length) {
    return { action: "NONE", top: null, risks, blockers: [], reasonCodes };
  }

  const top = actionable[0];
  const recentGroups = history.sprays
    .slice(0, s.spray_rotation_lookback)
    .map((x) => x.group)
    .filter(Boolean);
  const selection = selectProducts({
    rules,
    targetId: top.targetId,
    farmingType,
    country,
    region,
    cropKey: crop.key,
    risk: top.risk,
    nearHarvest,
    recentGroups,
  });
  const product = selection.products[0] || null;
  const alternatives = selection.products.slice(1, 3);
  if (selection.rotationApplied) reasonCodes.push("rotation_applied");
  reasonCodes.push(selection.registrationVerified ? "registration_verified" : "registration_not_verified");

  const lastSameTarget = history.sprays.find((x) => x.targetId === top.targetId);
  const daysSince = lastSameTarget ? daysBetween(lastSameTarget.date, todayISO) : null;

  const today = dayAt(series, 0) || {};
  const blockers = [];
  if (today.rain !== null && today.rain >= s.spray_rain_block_mm) blockers.push("rain");
  if (today.wind !== null && today.wind > s.spray_max_wind_kmh) blockers.push("wind");
  const timing = today.tmax !== null && today.tmax >= s.spray_heat_c ? "evening" : "morning";

  const base = {
    top,
    risks,
    product,
    alternatives,
    blockers,
    timing,
    nearHarvest,
    reasonCodes,
  };

  if (lastSameTarget && daysSince !== null && daysSince < s.spray_reapply_days) {
    return { ...base, action: "RECENTLY_TREATED", lastSprayDate: lastSameTarget.date };
  }

  if (top.risk === "MODERATE") {
    return { ...base, action: "MONITOR" };
  }

  // HIGH risk from here.
  if (!product) {
    return { ...base, action: nearHarvest ? "HARVEST_NO_CHEMICAL" : "CONSULT" };
  }
  if (blockers.length) {
    return { ...base, action: "WAIT", nextSprayDate: nextSprayableDay(series, s) };
  }
  return { ...base, action: "SPRAY" };
}

export { addDays };
