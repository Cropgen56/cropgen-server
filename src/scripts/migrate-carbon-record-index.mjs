/**
 * Multi-crop Phase 5: drop the stale `{farmFieldId, date}` unique index on
 * FarmCarbonRecord, replaced by `{farmFieldId, cropInstanceId, date}`
 * (see src/models/farm-carbon-record.model.js). Without this, a farm's
 * second active crop's same-day carbon record silently overwrites the
 * first crop's — MongoDB's unique constraint on the OLD index still
 * matches even though the model/code has moved on, since Mongoose does not
 * drop superseded indexes automatically.
 *
 * Idempotent: no-ops if the old index is already gone.
 *
 * Usage (from cropgen-server root):
 *   node src/scripts/migrate-carbon-record-index.mjs [--dry-run]
 */
import dotenv from "dotenv";
import mongoose from "mongoose";
import { connectToDatabase } from "../config/db.js";

dotenv.config();

const DRY_RUN = process.argv.includes("--dry-run");
const OLD_INDEX_NAME = "farmFieldId_1_date_1";

async function main() {
  await connectToDatabase();

  const collection = mongoose.connection.db.collection("farmcarbonrecords");
  const indexes = await collection.indexes();
  const hasOldIndex = indexes.some((i) => i.name === OLD_INDEX_NAME);

  if (!hasOldIndex) {
    console.log(`Index "${OLD_INDEX_NAME}" not present — nothing to do.`);
  } else if (DRY_RUN) {
    console.log(`[dry-run] would drop index "${OLD_INDEX_NAME}"`);
  } else {
    await collection.dropIndex(OLD_INDEX_NAME);
    console.log(`Dropped stale index "${OLD_INDEX_NAME}".`);
  }

  const finalIndexes = await collection.indexes();
  console.log("Current indexes:", finalIndexes.map((i) => i.name));

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
