/**
 * Seed Biodrops shop products from precisionFarmingKit catalog.
 *
 * Usage (from cropgen-server root):
 *   node src/clients/biodrops/scripts/seed-biodrops-products.mjs
 */
import dotenv from "dotenv";
import { connectToDatabase } from "../../../config/db.js";
import BiodropsProduct from "../models/biodrops-product.model.js";
import { BIODROPS_PRODUCT_CATALOG } from "../data/precisionFarmingKit.js";

dotenv.config();

const ROLE_TO_CATEGORY = {
  organic_matter: "compost",
  nitrogen: "biofertilizer",
  phosphorus: "biofertilizer",
  potassium: "biofertilizer",
  disease_control: "disease_control",
  fungal_control: "fungicide",
  root_growth: "biofertilizer",
};

const PLACEHOLDER_PRICES_MINOR = {
  bokashi: 149900,
  azospirillum: 49900,
  psb: 49900,
  kmb: 49900,
  pseudomonas: 59900,
  trichoderma: 59900,
  vam: 79900,
};

await connectToDatabase();

let created = 0;
let skipped = 0;

for (const [sku, entry] of Object.entries(BIODROPS_PRODUCT_CATALOG)) {
  const existing = await BiodropsProduct.findOne({ sku }).lean();
  if (existing) {
    skipped += 1;
    continue;
  }

  await BiodropsProduct.create({
    sku,
    name: entry.productName,
    description: entry.tagline,
    tagline: entry.tagline,
    images: entry.productImageUrl
      ? [{ url: entry.productImageUrl, alt: entry.productName }]
      : [],
    priceMinor: PLACEHOLDER_PRICES_MINOR[sku] ?? 49900,
    currency: "INR",
    unit: "per_unit",
    category: ROLE_TO_CATEGORY[entry.role] || "other",
    stockQuantity: null,
    status: "active",
    applicationMethod: entry.defaultMethod || "",
    sortOrder: created,
  });
  created += 1;
}

console.log(`Biodrops products seed complete. created=${created} skipped=${skipped}`);
process.exit(0);
