/**
 * BBCH-based Fertilizer Schedule Calculator
 * Generates a crop-specific split-application schedule from total crop nutrient removal
 * and actual crop-profile NPK data. This gives the LLM (and farmers) a clear view of:
 *   - What total nutrients the crop needs this season
 *   - Which split(s) are due at the current BBCH stage
 *   - Exact products and kg/acre per split
 */

import { CROP_PROFILES } from "../npk/cropProfiles.js";

const ACRES_PER_HA = 2.471;

function normalizeCropName(name) {
  return (name || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function kgHaToKgAcre(kgPerHa) {
  return Math.round((kgPerHa / ACRES_PER_HA) * 10) / 10;
}

function totalKgFarm(kgPerHa, acre) {
  return Math.round(kgHaToKgAcre(kgPerHa) * acre * 10) / 10;
}

/**
 * Three canonical BBCH windows that map to early / vegetative / reproductive.
 */
const BBCH_WINDOWS = [
  { label: "early",        bbchMin: 0,  bbchMax: 29,  splitFractions: { N: 0.30, P: 0.55, K: 0.30 } },
  { label: "vegetative",   bbchMin: 30, bbchMax: 59,  splitFractions: { N: 0.40, P: 0.25, K: 0.40 } },
  { label: "reproductive", bbchMin: 60, bbchMax: 100, splitFractions: { N: 0.30, P: 0.20, K: 0.30 } },
];

/** Inorganic product choices per dominant nutrient + fraction */
function pickInorganicProducts(N_kgHa, P_kgHa, K_kgHa, acre, isDrip) {
  const products = [];
  const method = isDrip ? "Drip fertigation" : "Broadcast + immediate irrigation";

  if (N_kgHa > 3) {
    const ureaDose = Math.round(N_kgHa / 0.46);
    products.push({
      name: "Urea 46%",
      quantityKgPerHa: ureaDose,
      quantityKgPerAcre: kgHaToKgAcre(ureaDose),
      totalKgFarm: totalKgFarm(ureaDose, acre),
      method,
    });
  }
  if (P_kgHa > 3) {
    const dapDose = Math.round(P_kgHa / 0.46);
    products.push({
      name: "DAP 18:46:0",
      quantityKgPerHa: dapDose,
      quantityKgPerAcre: kgHaToKgAcre(dapDose),
      totalKgFarm: totalKgFarm(dapDose, acre),
      method,
    });
  }
  if (K_kgHa > 3) {
    const mopDose = Math.round(K_kgHa / 0.60);
    products.push({
      name: "MOP 60%",
      quantityKgPerHa: mopDose,
      quantityKgPerAcre: kgHaToKgAcre(mopDose),
      totalKgFarm: totalKgFarm(mopDose, acre),
      method,
    });
  }
  // Fallback: balanced NPK
  if (products.length === 0) {
    const dominant = Math.max(N_kgHa, P_kgHa, K_kgHa);
    const npkDose = Math.round(dominant / 0.19);
    products.push({
      name: "NPK 19:19:19",
      quantityKgPerHa: npkDose,
      quantityKgPerAcre: kgHaToKgAcre(npkDose),
      totalKgFarm: totalKgFarm(npkDose, acre),
      method,
    });
  }
  return products;
}

/** Organic product choices */
function pickOrganicProducts(N_kgHa, P_kgHa, K_kgHa, acre, isDrip) {
  const products = [];
  const method = isDrip ? "Soil drench or drip application" : "Top-dress + irrigate";
  const nTotal = N_kgHa + P_kgHa + K_kgHa;

  if (nTotal > 0) {
    // Vermicompost as base (N ~1.5%, P ~1%, K ~0.5%)
    const vcKgHa = Math.min(2000, Math.round(Math.max(N_kgHa / 0.015, P_kgHa / 0.01, K_kgHa / 0.005)));
    products.push({
      name: "Vermicompost",
      composition: "N ~1.5%, P ~1%, K ~0.5%",
      quantityKgPerHa: vcKgHa,
      quantityKgPerAcre: kgHaToKgAcre(vcKgHa),
      totalKgFarm: totalKgFarm(vcKgHa, acre),
      method,
    });
    if (N_kgHa > 5) {
      const neemKgHa = Math.min(250, Math.round(N_kgHa / 0.05));
      products.push({
        name: "Neem cake",
        composition: "N ~5%, P ~1%, K ~1.5%",
        quantityKgPerHa: neemKgHa,
        quantityKgPerAcre: kgHaToKgAcre(neemKgHa),
        totalKgFarm: totalKgFarm(neemKgHa, acre),
        method,
      });
    }
  }
  return products;
}

/** Integrated: organic base + reduced chemical top-up */
function pickIntegratedProducts(N_kgHa, P_kgHa, K_kgHa, acre, isDrip) {
  const chemShare = 0.50;
  const chem = pickInorganicProducts(
    N_kgHa * chemShare, P_kgHa * chemShare, K_kgHa * chemShare, acre, isDrip,
  );
  const org = pickOrganicProducts(
    N_kgHa * (1 - chemShare), P_kgHa * (1 - chemShare), K_kgHa * (1 - chemShare), acre, isDrip,
  );
  return [...org, ...chem];
}

/**
 * Build one split-application entry.
 */
function buildSplit(window, cropNPK, fractions, acre, farmingType, isDrip) {
  const N = Math.round(cropNPK.N * fractions.N);
  const P = Math.round(cropNPK.P * fractions.P);
  const K = Math.round(cropNPK.K * fractions.K);

  let products;
  if (farmingType === "Organic") {
    products = pickOrganicProducts(N, P, K, acre, isDrip);
  } else if (farmingType === "Inorganic") {
    products = pickInorganicProducts(N, P, K, acre, isDrip);
  } else {
    products = pickIntegratedProducts(N, P, K, acre, isDrip);
  }

  const stageLabel = { early: "Vegetative (BBCH 0–29)", vegetative: "Stem elongation (BBCH 30–59)", reproductive: "Flowering & grain fill (BBCH 60+)" };

  return {
    bbchWindow: `${window.bbchMin}–${window.bbchMax}`,
    stageLabel: stageLabel[window.label] || window.label,
    N_kgPerHa: N,
    P_kgPerHa: P,
    K_kgPerHa: K,
    products,
    timing: window.label === "early"
      ? "At sowing / early emergence"
      : window.label === "vegetative"
      ? "Top-dress at 30–45 DAS"
      : "Fertigation at flowering / grain initiation",
    application: isDrip ? "Dissolve in water; apply via drip system" : "Broadcast; water immediately",
  };
}

/**
 * Generate full BBCH-based fertilizer split schedule for a crop.
 *
 * @param {Object} params
 * @param {string} params.cropName
 * @param {number} params.bbchStage     - current BBCH (to mark current / upcoming splits)
 * @param {number} params.acre          - farm area
 * @param {string} params.farmingType   - 'Organic' | 'Inorganic' | 'Integrated'
 * @param {string} params.irrigationType
 * @returns {Object} { totalNutrients, applications, currentApplication, upcomingApplications, summary }
 */
export function calculateFertilizerSchedule({
  cropName,
  bbchStage = 30,
  acre = 1,
  farmingType = "Integrated",
  irrigationType = "drip",
}) {
  const key = normalizeCropName(cropName);
  const profile = CROP_PROFILES[key];
  const cropNPK = profile?.totalNPK ?? { N: 120, P: 50, K: 40 };
  const isDrip = (irrigationType || "").toLowerCase().includes("drip");

  const splits = BBCH_WINDOWS.map((w) =>
    buildSplit(w, cropNPK, w.splitFractions, acre, farmingType, isDrip),
  );

  // Mark each split relative to current BBCH
  const annotated = splits.map((s, i) => {
    const window = BBCH_WINDOWS[i];
    let status;
    if (bbchStage > window.bbchMax) {
      status = "completed"; // past this window
    } else if (bbchStage >= window.bbchMin) {
      status = "current";  // within this window now
    } else {
      status = "upcoming"; // future window
    }
    return { ...s, status };
  });

  const currentApplication = annotated.find((s) => s.status === "current") || null;
  const upcomingApplications = annotated.filter((s) => s.status === "upcoming");

  return {
    totalNutrients: {
      N_kgPerHa: cropNPK.N,
      P_kgPerHa: cropNPK.P,
      K_kgPerHa: cropNPK.K,
      source: "Crop nutrient removal from profile",
    },
    applications: annotated,
    currentApplication,
    upcomingApplications,
    summary: `${cropName}: Total N=${cropNPK.N}, P=${cropNPK.P}, K=${cropNPK.K} kg/ha across 3 splits. Current BBCH=${bbchStage}.`,
  };
}
