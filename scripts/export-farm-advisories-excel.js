/**
 * Export all FarmAdvisory documents to Excel (.xlsx).
 *
 * Usage:
 *   node scripts/export-farm-advisories-excel.js
 *   node scripts/export-farm-advisories-excel.js --out ./my-export.xlsx
 */
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";
import * as XLSX from "xlsx";
import FarmAdvisory from "../src/features/advisory/models/farmAdvisory.model.js";
import FarmField from "../src/models/field.model.js";
import User from "../src/models/user.model.js";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function jsonCell(value) {
  if (value == null) return "";
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return value;
}

function formatDate(d) {
  if (!d) return "";
  const dt = d instanceof Date ? d : new Date(d);
  return Number.isNaN(dt.getTime()) ? "" : dt.toISOString();
}

function rowFromAdvisory(doc) {
  const farm = doc.farmFieldId && typeof doc.farmFieldId === "object" ? doc.farmFieldId : null;
  const user = farm?.user && typeof farm.user === "object" ? farm.user : null;

  return {
    advisoryId: String(doc._id),
    createdAt: formatDate(doc.createdAt),
    updatedAt: formatDate(doc.updatedAt),
    farmFieldId: farm?._id ? String(farm._id) : String(doc.farmFieldId || ""),
    fieldName: farm?.fieldName ?? "",
    cropName: farm?.cropName ?? "",
    variety: farm?.variety ?? "",
    acre: farm?.acre ?? "",
    sowingDate: farm?.sowingDate ?? "",
    typeOfFarming: farm?.typeOfFarming ?? "",
    typeOfIrrigation: farm?.typeOfIrrigation ?? "",
    userId: user?._id ? String(user._id) : "",
    userFirstName: user?.firstName ?? "",
    userLastName: user?.lastName ?? "",
    userEmail: user?.email ?? "",
    userPhone: user?.phone ?? "",
    cropHealthScore: doc.cropHealth?.score ?? "",
    cropHealthPercentage: doc.cropHealth?.percentage ?? "",
    cropHealthCategory: doc.cropHealth?.category ?? "",
    cropHealthRecommendation: doc.cropHealth?.recommendation ?? "",
    standardYield: doc.yield?.standardYield ?? "",
    aiYield: doc.yield?.aiYield ?? "",
    yieldUnit: doc.yield?.unit ?? "",
    yieldExplanation: doc.yield?.explanation ?? "",
    bbchStage: doc.plantGrowthActivity?.bbchStage ?? "",
    stageName: doc.plantGrowthActivity?.stageName ?? "",
    stageDescription: doc.plantGrowthActivity?.description ?? "",
    cumulativeGDD: doc.plantGrowthActivity?.cumulativeGDD ?? "",
    carbonEmissionKgCO2: doc.carbonData?.emissionKgCO2 ?? "",
    carbonCapturedKgCO2: doc.carbonData?.capturedKgCO2 ?? "",
    carbonNetBalanceKgCO2: doc.carbonData?.netBalanceKgCO2 ?? "",
    activitiesCount: Array.isArray(doc.activitiesToDo) ? doc.activitiesToDo.length : 0,
    recommendedProductsCount: Array.isArray(doc.recommendedProducts)
      ? doc.recommendedProducts.length
      : 0,
    npkManagement: jsonCell(doc.npkManagement),
    opticalIndicesSummary: jsonCell(doc.opticalIndicesSummary),
    recommendedProducts: jsonCell(doc.recommendedProducts),
    activitiesToDo: jsonCell(doc.activitiesToDo),
  };
}

function rowsFromActivities(doc) {
  const farm = doc.farmFieldId && typeof doc.farmFieldId === "object" ? doc.farmFieldId : null;
  const activities = Array.isArray(doc.activitiesToDo) ? doc.activitiesToDo : [];

  return activities.map((act, index) => ({
    advisoryId: String(doc._id),
    fieldName: farm?.fieldName ?? "",
    activityIndex: index + 1,
    type: act.type ?? "",
    title: act.title ?? "",
    message: act.message ?? "",
    details: jsonCell(act.details),
  }));
}

function rowsFromProducts(doc) {
  const farm = doc.farmFieldId && typeof doc.farmFieldId === "object" ? doc.farmFieldId : null;
  const products = Array.isArray(doc.recommendedProducts) ? doc.recommendedProducts : [];

  return products.map((p, index) => ({
    advisoryId: String(doc._id),
    fieldName: farm?.fieldName ?? "",
    productIndex: index + 1,
    productName: p.productName ?? "",
    productImageUrl: p.productImageUrl ?? "",
    productSourceUrl: p.productSourceUrl ?? "",
    description: p.description ?? "",
  }));
}

function sheetFromRows(rows, name) {
  const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{ note: "No data" }]);
  return { name, ws };
}

function resolveOutputPath() {
  const outArg = process.argv.find((a) => a.startsWith("--out="));
  if (outArg) return path.resolve(outArg.split("=")[1]);

  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const dir = path.join(__dirname, "exports");
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, `farm-advisories-${stamp}.xlsx`);
}

async function main() {
  if (!process.env.MONGO_URI) {
    console.error("MONGO_URI is not set");
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI);

  const advisories = await FarmAdvisory.find()
    .sort({ createdAt: -1 })
    .populate({
      path: "farmFieldId",
      select: "fieldName cropName variety acre sowingDate typeOfFarming typeOfIrrigation user",
      populate: { path: "user", select: "firstName lastName email phone" },
    })
    .lean();

  const advisoryRows = advisories.map(rowFromAdvisory);
  const activityRows = advisories.flatMap(rowsFromActivities);
  const productRows = advisories.flatMap(rowsFromProducts);

  const workbook = XLSX.utils.book_new();
  const sheets = [
    sheetFromRows(advisoryRows, "Advisories"),
    sheetFromRows(activityRows, "Activities"),
    sheetFromRows(productRows, "RecommendedProducts"),
  ];

  for (const { name, ws } of sheets) {
    XLSX.utils.book_append_sheet(workbook, ws, name);
  }

  const outPath = resolveOutputPath();
  XLSX.writeFile(workbook, outPath);

  await mongoose.disconnect();

  console.log(`Exported ${advisories.length} advisories`);
  console.log(`  Activities rows: ${activityRows.length}`);
  console.log(`  Products rows: ${productRows.length}`);
  console.log(`File: ${outPath}`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
