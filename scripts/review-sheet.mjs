/**
 * Review workflow for knowledge records.
 *   node scripts/review-sheet.mjs export <records.json> <sheet.csv>
 *   node scripts/review-sheet.mjs apply  <records.json> <reviewed.csv> <approved.json>
 * In the sheet fill: decision (approve | fix | drop), reviewer, review_date (YYYY-MM-DD),
 * and for "fix" the fix_* columns you want to change (leave others blank).
 * apply writes ONLY approve/fix rows to <approved.json> with status "approved".
 */
import fs from "node:fs";

const [cmd, recordsPath, sheetPath, outPath] = process.argv.slice(2);

const esc = (v) => {
  const s = v == null ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
function parseCsv(text) {
  const rows = []; let row = [], cell = "", q = false;
  text = text.replace(/^﻿/, "");
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); cell = ""; if (row.some((x) => x !== "")) rows.push(row); row = [];
    } else cell += c;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

const COLS = ["recordId","priority","page","topic","stage","book_says_(recommendation)","value","max","unit","basis","conditions","contraindications","note_for_reviewer",
  "decision","fix_recommendation","fix_value","fix_max","fix_unit","fix_basis","fix_contraindications","reviewer","review_date","comment"];
const HIGH = /DISEASE-00[1-6]|PEST-00[345]|WEED-001/;
const MED = /NUTR-00[12]|HARVEST-001|WEATHER-002/;

const recs = JSON.parse(fs.readFileSync(recordsPath, "utf8"));

if (cmd === "export") {
  const lines = [COLS.join(",")];
  for (const r of recs) {
    lines.push([r.recordId, HIGH.test(r.recordId) ? "HIGH" : MED.test(r.recordId) ? "MEDIUM" : "LOW", r.source.pageOrSection, r.topic, r.growthStage,
      r.recommendation, r.numericValue, r.numericValueMax, r.numericUnit, r.calculationBasis, r.conditions, r.contraindications, r.reviewNotes,
      "", "", "", "", "", "", "", "", "", ""].map(esc).join(","));
  }
  fs.writeFileSync(sheetPath, "﻿" + lines.join("\r\n"));
  console.log(`Wrote ${recs.length} rows to ${sheetPath}`);
} else if (cmd === "apply") {
  const [head, ...body] = parseCsv(fs.readFileSync(sheetPath, "utf8"));
  const idx = Object.fromEntries(head.map((h, i) => [h.trim(), i]));
  const byId = new Map(recs.map((r) => [r.recordId, r]));
  const out = []; const problems = []; let drop = 0, pending = 0;
  for (const row of body) {
    const get = (k) => (row[idx[k]] ?? "").trim();
    const id = get("recordId"); const rec = byId.get(id);
    if (!rec) { problems.push(`${id}: unknown recordId`); continue; }
    const dec = get("decision").toLowerCase();
    if (!dec) { pending++; continue; }
    if (dec === "drop") { drop++; continue; }
    if (dec !== "approve" && dec !== "fix") { problems.push(`${id}: decision must be approve, fix or drop`); continue; }
    if (!get("reviewer") || !/^\d{4}-\d{2}-\d{2}$/.test(get("review_date"))) { problems.push(`${id}: reviewer and review_date (YYYY-MM-DD) required`); continue; }
    const r = JSON.parse(JSON.stringify(rec));
    if (dec === "fix") {
      if (get("fix_recommendation")) r.recommendation = get("fix_recommendation");
      if (get("fix_value") !== "") r.numericValue = Number(get("fix_value"));
      if (get("fix_max") !== "") r.numericValueMax = Number(get("fix_max"));
      if (get("fix_unit")) r.numericUnit = get("fix_unit");
      if (get("fix_basis")) r.calculationBasis = get("fix_basis");
      if (get("fix_contraindications")) r.contraindications = get("fix_contraindications");
    }
    r.status = "approved";
    r.reviewedOn = get("review_date");
    r.reviewNotes = [r.reviewNotes, `Reviewed by ${get("reviewer")} (${dec})${get("comment") ? ": " + get("comment") : ""}`].filter(Boolean).join(" | ");
    out.push(r);
  }
  if (problems.length) { console.error("Fix these rows first:\n" + problems.join("\n")); process.exit(1); }
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log(`approved/fixed: ${out.length}, dropped: ${drop}, not yet reviewed: ${pending}. Wrote ${outPath}`);
} else {
  console.error("Usage: export|apply — see header of this file"); process.exit(2);
}
