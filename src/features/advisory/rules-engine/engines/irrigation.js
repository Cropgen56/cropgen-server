import { dayAt, sumField } from "../features/weather.js";
import {
  isCriticalStage,
  isNearHarvest,
  kcAtStage,
  rootDepthAtStage,
} from "../features/cropStage.js";
import { normalizeKey } from "../rulesStore.js";

const SQM_PER_ACRE = 4046.86;
/** Typical depth of one surface irrigation used to scale "usual hours per acre". */
const TYPICAL_SURFACE_IRRIGATION_MM = 60;
const DEFAULT_ET0 = 4;

const SOIL_ALIASES = [
  [/black|vertisol|regur|cotton/, "blackcottonvertisol"],
  [/sandyloam|loamysand/, "sandyloam"],
  [/clayloam|siltyclay|siltloam/, "clayloam"],
  [/sand/, "sandy"],
  [/clay/, "clayey"],
  [/red/, "redsoil"],
  [/alluvial/, "alluvial"],
  [/laterit/, "laterite"],
  [/loam|silt/, "loamy"],
];

export function resolveSoil(rules, soilType) {
  const key = normalizeKey(soilType);
  if (key && rules.soils[key]) return { ...rules.soils[key], key, assumed: false };
  for (const [re, target] of SOIL_ALIASES) {
    if (key && re.test(key) && rules.soils[target]) return { ...rules.soils[target], key: target, assumed: false };
  }
  return { ...rules.soils.loamy, key: "loamy", assumed: true };
}

export function resolveMethod(rules, irrigationType, family) {
  const key = normalizeKey(irrigationType);
  const methods = rules.irrigationMethods;
  if (key) {
    if (/pivot/.test(key)) return methods.find((m) => /pivot/i.test(m.name)) || null;
    if (/furrow/.test(key)) return methods.find((m) => /furrow/i.test(m.name)) || null;
    if (/micro/.test(key)) return methods.find((m) => /micro/i.test(m.name)) || null;
    const exact = methods.find((m) => normalizeKey(m.name).includes(key));
    if (exact && exact.family === family) return exact;
  }
  return methods.find((m) => m.family === family) || null;
}

function round(n, step = 1) {
  return Math.round(n / step) * step;
}

function effectiveRain(rain, s) {
  if (rain === null || rain === undefined) return 0;
  const minMm = Number(s.irr_min_effective_rain_mm ?? 2);
  return rain >= minMm ? rain * s.irr_effective_rain_fraction : 0;
}

/**
 * FAO-56 style root-zone depletion (mm) for today, from a daily water balance.
 *
 * The balance starts at field capacity (depletion 0) on the most recent
 * "refill" anchor: the last irrigation the farmer completed, or the sowing
 * date. Soaking rain refills naturally through the balance itself. If no
 * anchor falls inside the available weather series, the balance starts at the
 * first day of the series and the result is flagged as assumed.
 */
/** Typical days between irrigations when the farmer has not recorded any (Settings can override). */
function assumedIntervalDays(family, s) {
  if (family === "drip") return Number(s.irr_assumed_interval_drip_days ?? 3);
  if (family === "sprinkler") return Number(s.irr_assumed_interval_sprinkler_days ?? 7);
  if (family === "flood") return Number(s.irr_assumed_interval_flood_days ?? 12);
  return null; // rainfed: no assumed irrigation
}

export function waterBalance({ series, crop, bbch, tawMm, settings, lastIrrigationISO, sowingISO, family }) {
  const kc = kcAtStage(crop, bbch) ?? 1;
  const days = series.days;
  const todayIdx = series.todayIndex;
  const et0Known = days.slice(0, todayIdx + 1).map((d) => d.et0).filter((v) => v !== null && v !== undefined);
  const et0Fallback = et0Known.length ? et0Known.reduce((a, b) => a + b, 0) / et0Known.length : DEFAULT_ET0;

  // Irrigated farm without any recorded irrigation: assume the farmer follows a
  // normal schedule for the method rather than "no water for the whole season".
  let assumedIrrigationISO = null;
  const interval = lastIrrigationISO ? null : assumedIntervalDays(family, settings);
  if (interval) {
    const d = new Date(`${days[todayIdx].date}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - interval);
    assumedIrrigationISO = d.toISOString().slice(0, 10);
  }
  const anchors = [lastIrrigationISO, sowingISO, assumedIrrigationISO].filter(Boolean).sort().reverse();
  const anchor = anchors.find((a) => a <= days[todayIdx].date) || null;
  let startIdx = 0;
  let assumedStart = true;
  if (anchor) {
    const idx = days.findIndex((d) => d.date >= anchor);
    if (idx >= 0 && days[idx].date === anchor) {
      startIdx = idx + 1; // anchor day itself ends at field capacity
      assumedStart = false;
    } else if (idx > 0) {
      // Anchor falls in a gap of the series; start right after it.
      startIdx = idx;
      assumedStart = false;
    }
  }

  let depletion = 0;
  let observedDays = 0;
  for (let i = startIdx; i <= todayIdx; i++) {
    const d = days[i];
    const et0 = d.et0 ?? et0Fallback;
    depletion += et0 * kc - effectiveRain(d.rain, settings);
    depletion = Math.max(0, Math.min(tawMm, depletion));
    if (d.source === "observed") observedDays++;
  }
  return {
    depletionMm: depletion,
    assumedStart,
    assumedLastIrrigation: Boolean(assumedIrrigationISO) && anchor === assumedIrrigationISO,
    anchor: assumedStart ? days[0]?.date || null : anchor,
    balanceDays: todayIdx - startIdx + 1,
    observedDays,
  };
}

/**
 * Optional: depletion from the weather model's grid soil moisture. Off by
 * default (Settings → irr_use_model_soil_moisture) because the model uses its
 * own soil texture, not the farm's, so absolute values are not comparable.
 */
function modelDepletion({ series, soil, tawMm }) {
  const theta = series.current?.soilMoisture15 ?? series.current?.soilMoisture5 ?? null;
  if (theta === null) return null;
  const frac = Math.max(0, Math.min(1, (soil.fc - theta) / (soil.fc - soil.wp)));
  return frac * tawMm;
}

function triggerFor(family, rawMm, etc, critical, s) {
  const crit = critical ? s.irr_critical_fraction : 1;
  if (family === "drip") {
    // Drip is run little and often: replace use once it exceeds a day's demand
    // or a fraction of the readily available water, whichever is larger.
    return Math.max(etc ?? 0, rawMm * Number(s.drip_trigger_fraction ?? 0.25)) * (critical ? 0.8 : 1);
  }
  return rawMm * crit;
}

/**
 * Decide irrigation for today.
 * action: NOT_APPLICABLE | SKIP_RAIN | DRAIN | STOP_HARVEST | IRRIGATE | PROTECTIVE |
 *         CONSERVE | POSTPONE_RAIN | LIGHT_HEAT | LIGHT_FROST | NONE | CHECK_MOISTURE
 */
export function decideIrrigation({ rules, crop, bbch, family, irrigationType, farm, series, history, sowingISO }) {
  const s = rules.settings;
  if (!crop || crop.indoor) return { action: "NOT_APPLICABLE", reasonCodes: ["indoor_or_unknown_crop"] };

  const today = dayAt(series, 0) || {};
  const rainToday = today.rain ?? 0;
  const rain3 = sumField(series, "rain", 0, 2);
  const rainNext2 = sumField(series, "rain", 1, 2);
  const tmaxToday = today.tmax;
  const tminTonight = Math.min(today.tmin ?? 99, dayAt(series, 1)?.tmin ?? 99);
  const windToday = today.wind;
  const method = resolveMethod(rules, irrigationType, family);
  const efficiency = method?.efficiency || 0.7;
  const soil = resolveSoil(rules, farm?.soilType);
  const critical = isCriticalStage(crop, bbch);
  const kc = kcAtStage(crop, bbch);
  const et0 = today.et0 ?? series.current?.et0 ?? null;
  const etc = et0 !== null && kc !== null ? et0 * kc : null;
  const reasonCodes = soil.assumed ? ["soil_type_assumed_loamy"] : [];

  const base = {
    family,
    method: method?.name || null,
    soil: soil.name,
    soilAssumed: soil.assumed,
    critical,
    kc: kc !== null ? Number(kc.toFixed(2)) : null,
    etcMmPerDay: etc !== null ? Number(etc.toFixed(2)) : null,
    rainTodayMm: rainToday,
    rain3dMm: rain3,
    reasonCodes,
  };

  if (rainToday >= s.irr_rain_skip_mm) return { ...base, action: "SKIP_RAIN" };
  if (crop.waterloggingSensitivity === "High" && rain3 >= s.drain_rain_3d_mm) {
    return { ...base, action: "DRAIN" };
  }
  if (family !== "rainfed" && crop.stopIrrigationDays !== null && isNearHarvest(crop, bbch, s)) {
    return { ...base, action: "STOP_HARVEST" };
  }

  // --- Root-zone water balance ---------------------------------------------
  const root = rootDepthAtStage(crop, bbch);
  const tawMm = (soil.fc - soil.wp) * 1000 * root;
  const rawMm = (crop.p ?? 0.5) * tawMm;

  let depletionMm = null;
  let source = null;
  const useModel = String(s.irr_use_model_soil_moisture ?? "false").toLowerCase() === "true";
  const lastIrrigationISO = history.irrigations[0]?.date || null;
  if (useModel && !lastIrrigationISO) {
    depletionMm = modelDepletion({ series, soil, tawMm });
    if (depletionMm !== null) source = "model_soil_moisture";
  }
  if (depletionMm === null && series.days.length) {
    const wb = waterBalance({ series, crop, bbch, tawMm, settings: s, lastIrrigationISO, sowingISO, family });
    depletionMm = wb.depletionMm;
    source = "water_balance";
    base.balanceAnchor = wb.anchor;
    base.balanceDays = wb.balanceDays;
    if (wb.assumedStart) reasonCodes.push("balance_start_assumed_field_capacity");
    if (wb.assumedLastIrrigation) reasonCodes.push("last_irrigation_assumed_from_method_schedule");
    if (!series.hasPast) reasonCodes.push("no_past_weather_in_balance");
  }
  Object.assign(base, {
    rootDepthM: Number(root.toFixed(2)),
    tawMm: round(tawMm),
    rawMm: round(rawMm),
    depletionMm: depletionMm !== null ? round(depletionMm) : null,
    depletionSource: source,
  });

  if (depletionMm === null) {
    return { ...base, action: family === "rainfed" ? "NONE" : "CHECK_MOISTURE", reasonCodes: [...reasonCodes, "no_soil_water_estimate"] };
  }

  const threshold = triggerFor(family, rawMm, etc, critical, s);
  base.triggerMm = round(threshold);
  if (depletionMm >= threshold && depletionMm > 0) {
    if (family === "rainfed") {
      if (depletionMm < rawMm) return { ...base, action: "NONE" };
      const hasWater = farm?.waterSource && !/none|^no$/i.test(String(farm.waterSource));
      return { ...base, action: hasWater && critical ? "PROTECTIVE" : "CONSERVE", amountMm: round(Math.min(depletionMm, Number(s.flood_max_mm ?? 75))) };
    }
    if (rainNext2 * s.irr_effective_rain_fraction >= depletionMm * 0.5) {
      return { ...base, action: "POSTPONE_RAIN", rainNext2Mm: round(rainNext2) };
    }
    const netMm = netAmount(family, depletionMm, rawMm, s);
    const grossMm = netMm / efficiency;
    const amount = formatAmount({ grossMm, family, method, farm, settings: s });
    let timing = "morning";
    if (tmaxToday !== null && tmaxToday >= s.heat_alert_c) timing = "evening";
    if (family === "sprinkler" && windToday !== null && windToday > s.spray_max_wind_kmh) timing = "night";
    return { ...base, action: "IRRIGATE", netMm: round(netMm), grossMm: round(grossMm), timing, ...amount };
  }

  if (family !== "rainfed") {
    if (tmaxToday !== null && tmaxToday >= s.heat_alert_c && depletionMm >= rawMm * 0.3) {
      return { ...base, action: "LIGHT_HEAT", tmax: tmaxToday };
    }
    if (tminTonight <= s.frost_alert_c && family !== "drip") {
      return { ...base, action: "LIGHT_FROST", tmin: tminTonight };
    }
  }

  // Drip is run daily: give today's normal run time (replace today's crop water
  // use minus effective rain). Shown in the app; not a WhatsApp trigger by itself.
  if (family === "drip" && etc && etc > 0) {
    const netMm = Math.max(0, etc - effectiveRain(rainToday, s));
    if (netMm >= 1) {
      const amount = formatAmount({ grossMm: netMm / efficiency, family, method, farm, settings: s });
      const timing = tmaxToday !== null && tmaxToday >= s.heat_alert_c ? "evening" : "morning";
      return { ...base, action: "MAINTAIN", netMm: round(netMm, 0.5), grossMm: round(netMm / efficiency, 0.5), timing, ...amount };
    }
  }

  const nextDays = etc && etc > 0 ? Math.max(1, Math.min(10, Math.round((threshold - depletionMm) / etc))) : null;
  return { ...base, action: "NONE", nextCheckDays: nextDays };
}

/** Net depth to apply (mm) — refill the depletion within practical limits of the method. */
function netAmount(family, depletionMm, rawMm, s) {
  if (family === "drip") return Math.min(depletionMm, Math.max(rawMm, 1));
  if (family === "sprinkler") return Math.min(depletionMm, Number(s.sprinkler_max_mm ?? 40));
  // Surface methods cannot apply very small depths evenly.
  const min = Number(s.flood_min_mm ?? 40);
  const max = Number(s.flood_max_mm ?? 75);
  return Math.max(min, Math.min(max, depletionMm));
}

function formatAmount({ grossMm, family, method, farm, settings: s }) {
  const d = farm?.irrigationDetails || {};
  const acre = Number(farm?.acre) || 1;
  const out = { unit: null, minutes: null, hours: null, litresPerPlant: null, rateSource: "default", splitAcrossDays: false };

  if (family === "drip") {
    let rate = method?.defaultRateMmPerHour || 4;
    if (d.emitterFlowLph && d.emitterSpacingM && d.lateralSpacingM) {
      rate = d.emitterFlowLph / (d.emitterSpacingM * d.lateralSpacingM);
      out.rateSource = "farmer";
    }
    const maxMin = Number(s.drip_max_minutes_per_day ?? 240);
    let minutes = Math.max(10, round((grossMm / rate) * 60, 5));
    if (minutes > maxMin) {
      minutes = maxMin;
      out.splitAcrossDays = true;
    }
    out.unit = "minutes";
    out.minutes = minutes;
    if (d.plantsPerAcre) {
      out.litresPerPlant = round((grossMm * SQM_PER_ACRE) / d.plantsPerAcre, 0.5);
    }
    return out;
  }
  if (family === "sprinkler") {
    let rate = method?.defaultRateMmPerHour || 10;
    if (d.sprinklerRateMmPerHour) {
      rate = d.sprinklerRateMmPerHour;
      out.rateSource = "farmer";
    }
    out.unit = "hours";
    out.hours = Math.max(0.5, round(grossMm / rate, 0.5));
    return out;
  }
  // flood / furrow / open
  out.unit = "mm";
  if (d.pumpDischargeLps) {
    out.hours = Math.max(0.5, round((grossMm * SQM_PER_ACRE * acre) / (d.pumpDischargeLps * 3600), 0.5));
    out.rateSource = "farmer";
  } else if (d.usualHoursPerAcre) {
    out.hours = Math.max(0.5, round(d.usualHoursPerAcre * acre * (grossMm / TYPICAL_SURFACE_IRRIGATION_MM), 0.5));
    out.rateSource = "farmer";
  }
  return out;
}
