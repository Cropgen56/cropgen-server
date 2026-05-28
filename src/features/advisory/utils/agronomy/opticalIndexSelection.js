import { OPTICAL_INDEX_NAMES } from "../../client/satellite.client.js";

const CORE_VEGETATION = ["NDVI", "NDMI", "NDWI", "NDRE", "EVI"];
const NUTRIENT_INDICES = ["NITROGEN", "CCC", "SOC"];
const MID_SEASON = ["SAVI", "MSAVI"];
const LATE_SEASON = ["RECI"];

/**
 * Production subset — avoids 14 parallel heavy /calculate/index calls per advisory.
 */
export function selectOpticalIndicesForAdvisory({
  cropName,
  bbchStage = 0,
  lightweight = false,
}) {
  if (lightweight) return [];

  const indices = new Set([...CORE_VEGETATION, ...NUTRIENT_INDICES]);

  if (bbchStage >= 60) {
    LATE_SEASON.forEach((i) => indices.add(i));
  } else {
    MID_SEASON.forEach((i) => indices.add(i));
  }

  const crop = (cropName || "").toLowerCase();
  if (crop.includes("cotton") || crop.includes("sugarcane")) {
    indices.add("EVI2");
  }

  return [...indices].filter((name) => OPTICAL_INDEX_NAMES.includes(name));
}
