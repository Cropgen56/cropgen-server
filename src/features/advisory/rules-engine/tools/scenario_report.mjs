#!/usr/bin/env node
/**
 * Scenario sweep: runs the rules engine over every crop × stage × farming type ×
 * irrigation method × weather pattern and checks safety invariants on every output.
 *
 *   node rules-engine/tools/scenario_report.mjs [outDir] [--statuses Draft,Reviewed,Approved]
 *
 * Writes:
 *   scenario_summary.csv     action counts per crop group / weather pattern
 *   scenario_violations.csv  every invariant break (should be empty)
 *   scenario_report.json     totals
 * Exit code 1 if any invariant is broken (use in CI after re-exporting the workbook).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runRulesEngine } from "../index.js";
import { addDays } from "../features/weather.js";
import { RAW_RULES } from "../tests/helpers.mjs";
import { indexRules } from "../rulesStore.js";

const args = process.argv.slice(2);
const si = args.indexOf("--statuses");
const statuses = si >= 0 ? args.splice(si, 2)[1].split(",") : ["Draft", "Reviewed", "Approved"];
const outDir = args[0] || ".";
const rules = indexRules(structuredClone(RAW_RULES), { liveStatuses: statuses });

const TODAY = "2026-07-15";
const NOW = new Date(`${TODAY}T05:30:00Z`);
const WEATHER = {
  humid_warm: { tmax: 29, tmin: 21, rh: 90, rain: 3, wind: 8, gust: 12, et0: 3.5 },
  hot_dry: { tmax: 41, tmin: 27, rh: 25, rain: 0, wind: 12, gust: 18, et0: 8 },
  mild_dry: { tmax: 30, tmin: 18, rh: 50, rain: 0, wind: 8, gust: 12, et0: 5 },
  windy: { tmax: 31, tmin: 22, rh: 60, rain: 0, wind: 28, gust: 40, et0: 6 },
  heavy_rain: { tmax: 27, tmin: 22, rh: 95, rain: 45, wind: 15, gust: 25, et0: 2 },
  cold_frost: { tmax: 14, tmin: 1, rh: 70, rain: 0, wind: 5, gust: 8, et0: 1.5 },
};
const FAMILIES = [
  ["drip", "Drip Irrigation"],
  ["sprinkler", "Sprinkler Irrigation"],
  ["flood", "Flood Irrigation"],
  ["rainfed", "Rainfed"],
];
const FARMING = ["Organic", "Integrated", "Inorganic"];
const BBCH = [15, 35, 61, 75, 88];

function wx(base) {
  const row = (o) => ({ date: addDays(TODAY, o), ...base, tmean: (base.tmax + base.tmin) / 2 });
  const historical = Array.from({ length: 30 }, (_, i) => row(i - 30));
  const fut = Array.from({ length: 7 }, (_, i) => row(i));
  const col = (k) => fut.map((r) => r[k]);
  return {
    historical,
    weatherSummary: {
      next7Days: { dates: col("date"), tempMax: col("tmax"), tempMin: col("tmin"), tempMean: col("tmean"), rainfall: col("rain"),
        humidity: col("rh"), windSpeed: col("wind"), windGusts: col("gust"), et0: col("et0") },
      current: { temp: fut[0].tmean, humidity: fut[0].rh, windSpeed: fut[0].wind },
    },
  };
}
const WX = Object.fromEntries(Object.entries(WEATHER).map(([k, v]) => [k, wx(v)]));
const productById = new Map(RAW_RULES.products.map((p) => [p.id, p]));
const s = rules.settings;

const violations = [];
const summary = new Map();
let runs = 0;
let errors = 0;
const t0 = Date.now();

for (const crop of Object.values(RAW_RULES.crops)) {
  for (const bbch of BBCH) for (const farming of FARMING) for (const [family, irrigation] of FAMILIES) for (const [wname, weather] of Object.entries(WX)) {
    const id = `${crop.key}|${bbch}|${farming}|${family}|${wname}`;
    let r;
    try {
      r = runRulesEngine({
        now: NOW, language: "en", rules, weather,
        farm: { cropName: crop.name, fieldName: "Plot", acre: 1, typeOfFarming: farming, typeOfIrrigation: irrigation, irrigationFamily: family, soilType: "Loamy", country: "IN", state: "MH" },
        crop: { bbchStage: bbch, stageName: "" },
        user: { firstName: "Test", country: "IN" },
      });
    } catch (err) {
      errors++;
      violations.push([id, "EXCEPTION", String(err?.message || err).slice(0, 200)]);
      continue;
    }
    runs++;
    const sp = r.decisions.spray;
    const ir = r.decisions.irrigation;
    const v = (rule, detail = "") => violations.push([id, rule, detail]);
    const prods = [sp.productId, ...(sp.alternativeIds || [])].filter(Boolean).map((p) => productById.get(p));

    if (farming === "Organic" && prods.some((p) => p?.kind === "Chemical")) v("organic_got_chemical", prods.map((p) => p.id).join(" "));
    if (prods.some((p) => p && !p.farmingTypes.includes(farming))) v("product_not_allowed_for_farming_type");
    if (sp.action === "SPRAY" && WEATHER[wname].wind > s.spray_max_wind_kmh) v("spray_in_wind");
    if (sp.action === "SPRAY" && WEATHER[wname].rain >= s.spray_rain_block_mm) v("spray_in_rain");
    if (sp.action === "SPRAY" && crop.lifecycle !== "Multi-cut" && bbch >= s.spray_harvest_block_bbch && prods.some((p) => p?.kind === "Chemical")) v("chemical_near_harvest");
    if (crop.indoor && sp.action === "SPRAY") v("spray_on_indoor_crop");
    if (family === "rainfed" && ["IRRIGATE", "MAINTAIN"].includes(ir.action)) v("rainfed_told_to_irrigate");
    if (["IRRIGATE", "MAINTAIN"].includes(ir.action) && WEATHER[wname].rain >= s.irr_rain_skip_mm) v("irrigate_in_heavy_rain");
    if (family === "drip" && ir.minutes > s.drip_max_minutes_per_day && !ir.splitAcrossDays) v("drip_minutes_over_cap", String(ir.minutes));
    if (family === "flood" && ir.action === "IRRIGATE" && (ir.netMm > s.flood_max_mm + 0.5)) v("flood_depth_over_cap", String(ir.netMm));
    if (ir.netMm !== undefined && ir.netMm !== null && (!Number.isFinite(ir.netMm) || ir.netMm < 0)) v("bad_irrigation_amount", String(ir.netMm));
    const text = JSON.stringify([r.activitiesToDo.map((a) => [a.title, a.message]), r.whatsapp]);
    if (/\{[a-zA-Z_]+\}/.test(text)) v("leftover_placeholder", text.match(/\{[a-zA-Z_]+\}/)[0]);
    if (/undefined|NaN|null ml|null g/.test(text)) v("bad_value_in_text", text.match(/undefined|NaN|null ml|null g/)[0]);
    if (r.whatsapp?.daily?.params?.some((p) => String(p).length > 1024)) v("whatsapp_param_too_long");

    const sk = `${crop.group}|${wname}`;
    const row = summary.get(sk) || { group: crop.group, weather: wname, runs: 0, spray: {}, irrigation: {}, alerts: {} };
    row.runs++;
    row.spray[sp.action] = (row.spray[sp.action] || 0) + 1;
    row.irrigation[ir.action] = (row.irrigation[ir.action] || 0) + 1;
    for (const a of r.alerts) row.alerts[a.alertId] = (row.alerts[a.alertId] || 0) + 1;
    summary.set(sk, row);
  }
}

const ms = Date.now() - t0;
mkdirSync(outDir, { recursive: true });
const csv = (rows) => rows.map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n") + "\n";
const fmt = (o) => Object.entries(o).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k}:${n}`).join(" ");
writeFileSync(join(outDir, "scenario_summary.csv"), csv([
  ["crop_group", "weather", "runs", "spray_actions", "irrigation_actions", "alerts"],
  ...[...summary.values()].map((r) => [r.group, r.weather, r.runs, fmt(r.spray), fmt(r.irrigation), fmt(r.alerts)]),
]));
writeFileSync(join(outDir, "scenario_violations.csv"), csv([["scenario (crop|bbch|farming|irrigation|weather)", "invariant", "detail"], ...violations]));
const byRule = {};
for (const [, rule] of violations) byRule[rule] = (byRule[rule] || 0) + 1;
const report = { rulesVersion: rules.version, liveStatuses: statuses, scenarios: runs + errors, exceptions: errors, violations: violations.length, byRule, msPerScenario: Number((ms / Math.max(1, runs)).toFixed(3)) };
writeFileSync(join(outDir, "scenario_report.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
process.exit(violations.length ? 1 : 0);
