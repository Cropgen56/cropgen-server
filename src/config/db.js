import mongoose from "mongoose";
import dotenv from "dotenv";
import UserSubscription from "../models/user-subscription.model.js";

dotenv.config();

/**
 * True for a unique index on exactly (userId|user) + billingCycle with no fieldId.
 * That old shape blocked a second farm's trial; trials must be unique per (user, field).
 */
function isLegacyTrialOnlyUserBillingIndex(indexDoc) {
  if (!indexDoc?.unique) return false;
  const k = indexDoc.key || {};
  const keys = Object.keys(k);
  if (keys.length !== 2) return false;
  if (!Object.prototype.hasOwnProperty.call(k, "billingCycle")) return false;
  if (
    !Object.prototype.hasOwnProperty.call(k, "userId") &&
    !Object.prototype.hasOwnProperty.call(k, "user")
  ) {
    return false;
  }
  return !Object.prototype.hasOwnProperty.call(k, "fieldId");
}

/**
 * Drops named legacy indexes and any unique 2-key user+billingCycle index found via listIndexes.
 */
async function dropLegacyUserSubscriptionIndexes() {
  const coll = mongoose.connection.collection("usersubscriptions");
  const byName = [
    "userId_1_billingCycle_1",
    "user_1_billingCycle_1",
  ];
  for (const name of byName) {
    try {
      await coll.dropIndex(name);
      console.log(`Dropped legacy usersubscriptions index: ${name}`);
    } catch (e) {
      const code = e?.code;
      const msg = String(e?.message || "").toLowerCase();
      if (code === 27 || msg.includes("index not found") || msg.includes("ns not found")) {
        continue;
      }
      console.warn(`Could not drop index ${name}:`, e?.message || e);
    }
  }

  try {
    const indexes = await coll.indexes();
    for (const idx of indexes) {
      if (idx.name === "_id_") continue;
      if (!isLegacyTrialOnlyUserBillingIndex(idx)) continue;
      if (byName.includes(idx.name)) continue;
      try {
        await coll.dropIndex(idx.name);
        console.log(`Dropped legacy usersubscriptions index (scanned): ${idx.name}`);
      } catch (e) {
        console.warn(`Could not drop index ${idx.name}:`, e?.message || e);
      }
    }
  } catch (e) {
    console.warn("Could not list usersubscriptions indexes:", e?.message || e);
  }
}

// Create MongoDB connection
export const connectToDatabase = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Successfully connected to the database");
    await dropLegacyUserSubscriptionIndexes();
    await UserSubscription.syncIndexes();
  } catch (error) {
    console.error("Unable to connect to the database:", error);
  }
};

export default mongoose;
