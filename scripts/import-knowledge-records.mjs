/**
 * Import KnowledgeRecords from JSON.  node scripts/import-knowledge-records.mjs <file.json> [--dry-run] [--approve]
 * Records import as `draft` unless the JSON row says status:"approved" AND --approve is passed
 * (an agronomist must have reviewed them). Upserts by recordId.
 */
import "dotenv/config";
import fs from "node:fs";
import mongoose from "mongoose";
import KnowledgeRecord from "../src/models/knowledge-record.model.js";

const [file, ...flags] = process.argv.slice(2);
if (!file) { console.error("Usage: import-knowledge-records.mjs <file.json> [--dry-run] [--approve]"); process.exit(2); }
const dry = flags.includes("--dry-run");
const approve = flags.includes("--approve");
const rows = JSON.parse(fs.readFileSync(file, "utf8"));
if (!Array.isArray(rows)) { console.error("JSON must be an array of records"); process.exit(2); }

let bad = 0;
const docs = [];
for (const row of rows) {
  const doc = new KnowledgeRecord({ ...row, crop: String(row.crop || "").toLowerCase(), status: approve && row.status === "approved" ? "approved" : "draft" });
  const err = doc.validateSync();
  if (err) { bad++; console.error(`✗ ${row.recordId}: ${err.message}`); } else docs.push(doc);
}
console.log(`${docs.length} valid, ${bad} invalid${dry ? " (dry run)" : ""}`);
if (bad) process.exit(1);
if (!dry) {
  await mongoose.connect(process.env.MONGO_URI);
  for (const d of docs) {
    const { _id, ...rest } = d.toObject();
    await KnowledgeRecord.updateOne({ recordId: d.recordId }, { $set: rest }, { upsert: true });
  }
  console.log(`Upserted ${docs.length} (status draft unless --approve and row approved).`);
  await mongoose.disconnect();
}
