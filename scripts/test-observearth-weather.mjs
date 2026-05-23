/**
 * Test all Observearth weather APIs and log status, timing, and response summary.
 *
 * Usage:
 *   node scripts/test-observearth-weather.mjs
 *   node scripts/test-observearth-weather.mjs --geometry-id=YOUR_AOI_UUID
 *   node scripts/test-observearth-weather.mjs --field-id=6a1169fd56c2a7aa5232418d
 */

import dotenv from "dotenv";
import axios from "axios";
import mongoose from "mongoose";

dotenv.config();

const BASE = "https://observearth.com/api/weather";
const AOI_DEFAULT = "cce22c2d-99f7-4670-8ad7-9f8897c48943";

function parseArgs() {
  const opts = { geometryId: AOI_DEFAULT, fieldId: null };
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith("--geometry-id=")) {
      opts.geometryId = arg.slice("--geometry-id=".length);
    }
    if (arg.startsWith("--field-id=")) {
      opts.fieldId = arg.slice("--field-id=".length);
    }
  }
  return opts;
}

function headers() {
  return {
    accept: "application/json",
    "x-api-key": process.env.OBSERVEARTH_API_KEY,
    ...(process.env.OBSERVEARTH_CSRF
      ? { "X-CSRFTOKEN": process.env.OBSERVEARTH_CSRF }
      : {}),
  };
}

function summarize(data, maxKeys = 20) {
  if (!data || typeof data !== "object") return data;
  const out = { topLevelKeys: Object.keys(data).slice(0, maxKeys) };
  if (data.current) {
    out.current = {
      temp: data.current.temp,
      relative_humidity: data.current.relative_humidity,
      precipitation: data.current.precipitation ?? data.current.rain,
      wind_speed: data.current.wind_speed,
    };
  }
  if (data.forecast?.time) {
    out.forecastDays = data.forecast.time.length;
    out.forecastSample = {
      dates: data.forecast.time?.slice(0, 3),
      temp_max: data.forecast.temp_max?.slice(0, 3),
      precipitation: data.forecast.precipitation?.slice(0, 3),
    };
  }
  if (data.daily?.time) {
    out.dailyCount = data.daily.time.length;
    out.dailySample = {
      firstDate: data.daily.time[0],
      lastDate: data.daily.time.at(-1),
      temp_max_first3: data.daily.temp_max?.slice(0, 3),
    };
  }
  return out;
}

async function callApi(name, url, timeoutMs) {
  const started = Date.now();
  console.log(`\n${"=".repeat(70)}`);
  console.log(`TEST: ${name}`);
  console.log(`URL:  ${url}`);
  console.log(`Timeout: ${timeoutMs}ms`);
  console.log("-".repeat(70));

  try {
    const res = await axios.get(url, {
      headers: headers(),
      timeout: timeoutMs,
      validateStatus: () => true,
    });
    const elapsed = Date.now() - started;
    console.log(`STATUS: ${res.status} (${elapsed}ms)`);
    if (res.status >= 400) {
      console.log("ERROR BODY:", JSON.stringify(res.data, null, 2));
      return { ok: false, status: res.status, elapsed, error: res.data };
    }
    console.log("SUMMARY:", JSON.stringify(summarize(res.data), null, 2));
    console.log("FULL RESPONSE (truncated 3000 chars):");
    const full = JSON.stringify(res.data, null, 2);
    console.log(full.length > 3000 ? `${full.slice(0, 3000)}\n... [truncated]` : full);
    return { ok: true, status: res.status, elapsed, data: res.data };
  } catch (err) {
    const elapsed = Date.now() - started;
    console.log(`FAILED (${elapsed}ms)`);
    console.log(`CODE: ${err.code || "—"}`);
    console.log(`MESSAGE: ${err.message}`);
    if (err.response) {
      console.log(`HTTP STATUS: ${err.response.status}`);
      console.log("BODY:", JSON.stringify(err.response.data, null, 2));
    }
    return {
      ok: false,
      elapsed,
      error: err.message,
      code: err.code,
      status: err.response?.status,
    };
  }
}

async function main() {
  const opts = parseArgs();
  let geometryId = opts.geometryId;
  let sowingDateISO = "2026-05-01";
  const endDate = new Date().toISOString().slice(0, 10);

  console.log("Observearth Weather API Diagnostic");
  console.log("API key set:", Boolean(process.env.OBSERVEARTH_API_KEY));
  console.log("CSRF set:", Boolean(process.env.OBSERVEARTH_CSRF));

  if (opts.fieldId && process.env.MONGO_URI) {
    await mongoose.connect(process.env.MONGO_URI);
    const FarmField = (await import("../src/models/field.model.js")).default;
    const farm = await FarmField.findById(opts.fieldId).lean();
    if (farm) {
      sowingDateISO = new Date(farm.sowingDate).toISOString().slice(0, 10);
      console.log(`Field: ${farm.fieldName} (${farm.cropName}), sowing: ${sowingDateISO}`);
    }
    await mongoose.disconnect();
  }

  const results = [];

  results.push(
    await callApi(
      "CURRENT",
      `${BASE}/current/?geometry_id=${geometryId}`,
      15000,
    ),
  );

  results.push(
    await callApi(
      "FORECAST",
      `${BASE}/forecast/?geometry_id=${geometryId}`,
      15000,
    ),
  );

  const historicalRanges = [
    { label: "1 day", start: daysAgo(endDate, 1), end: endDate },
    { label: "3 days", start: daysAgo(endDate, 3), end: endDate },
    { label: "7 days", start: daysAgo(endDate, 7), end: endDate },
    { label: "30 days", start: daysAgo(endDate, 30), end: endDate },
    { label: "sowing→today (FULL)", start: sowingDateISO, end: endDate },
  ];

  for (const range of historicalRanges) {
    results.push(
      await callApi(
        `HISTORICAL (${range.label})`,
        `${BASE}/historical/?geometry_id=${geometryId}&start_date=${range.start}&end_date=${range.end}`,
        12000,
      ),
    );
  }

  console.log(`\n${"=".repeat(70)}`);
  console.log("SUMMARY TABLE");
  console.log("=".repeat(70));
  console.log(
    "Test".padEnd(28) +
      "OK".padEnd(6) +
      "HTTP".padEnd(6) +
      "Time(ms)".padEnd(10) +
      "Issue",
  );
  console.log("-".repeat(70));

  const names = [
    "CURRENT",
    "FORECAST",
    ...historicalRanges.map((r) => `HISTORICAL (${r.label})`),
  ];
  results.forEach((r, i) => {
    let issue = "—";
    if (!r.ok) {
      if (r.code === "ECONNABORTED") issue = "TIMEOUT / HANG";
      else if (r.status === 403) issue = "PERMISSION DENIED";
      else if (r.status === 500) issue = "SERVER ERROR";
      else issue = r.error?.detail || r.error || "FAILED";
    }
    console.log(
      names[i].padEnd(28) +
        String(r.ok).padEnd(6) +
        String(r.status ?? "—").padEnd(6) +
        String(r.elapsed ?? "—").padEnd(10) +
        String(issue).slice(0, 40),
    );
  });

  console.log("\nDone.");
  process.exit(0);
}

function daysAgo(endISO, days) {
  const d = new Date(endISO);
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
