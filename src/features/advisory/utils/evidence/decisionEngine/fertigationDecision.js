import { normalizeTypeOfFarming } from "../../shared/farmingTypeNormalize.js";

const ACRES_PER_HA = 2.471;

function kgPerHaToKgPerAcre(kgPerHa) {
  return Math.round((Number(kgPerHa) || 0) / ACRES_PER_HA * 10) / 10;
}

function totalKgFarm(kgPerHa, acre) {
  return Math.round(kgPerHaToKgPerAcre(kgPerHa) * (Number(acre) || 1) * 10) / 10;
}

function gPerHaToGPerAcre(gPerHa) {
  return Math.round((Number(gPerHa) || 0) / ACRES_PER_HA);
}

/**
 * WATER-SOLUBLE FERTILIZER PRODUCT SELECTION
 * Only water-soluble / liquid products — drip/fertigation compatible
 * NPK 19:19:19 dose cap: 3–5 kg/acre max. Never more.
 */
function selectWaterSolubleProducts(N_kgHa, P_kgHa, K_kgHa, bbchStage, acre, isDrip) {
  const products = [];
  const method = isDrip ? "Drip fertigation" : "Soil drench + immediate irrigation";

  // Stage-based primary NPK selection
  // VEGETATIVE (BBCH 0–39): High N, moderate P
  // FLOWERING (BBCH 40–65): High P+K, low N
  // FRUITING (BBCH 66–79): High K, Ca, Mg
  // MATURITY (BBCH 80+): Minimal

  const isVegetative = bbchStage < 40;
  const isFlowering = bbchStage >= 40 && bbchStage <= 65;
  const isFruiting = bbchStage > 65 && bbchStage < 80;

  if (isVegetative) {
    // High N stage — use 12:61:0 (MKP not ideal here) or 19:19:19 + extra urea
    if (N_kgHa > 5) {
      const dose_ha = Math.min(25, Math.max(10, Math.round(N_kgHa / 0.19)));
      products.push({
        name: "NPK 19:19:19 (Water Soluble)",
        quantityKgPerHa: dose_ha,
        quantityKgPerAcre: Math.min(5, kgPerHaToKgPerAcre(dose_ha)), // CAPPED at 5 kg/acre
        totalKgFarm: Math.min(5, kgPerHaToKgPerAcre(dose_ha)) * acre,
        method,
        timing: "Morning 6–9 AM",
        note: "Split into 2 equal doses, every alternate day",
      });
    }
    if (N_kgHa > 8) {
      // Supplement with 100% water-soluble urea
      const urea_ha = Math.min(15, Math.round(N_kgHa * 0.3 / 0.46));
      products.push({
        name: "Water Soluble Urea 46%",
        quantityKgPerHa: urea_ha,
        quantityKgPerAcre: kgPerHaToKgPerAcre(urea_ha),
        totalKgFarm: totalKgFarm(urea_ha, acre),
        method,
        timing: "Morning, alternate days",
        note: "Dissolve fully before injecting into drip",
      });
    }
  }

  if (isFlowering) {
    // High P, high K — use MKP (0:52:34) + SOP
    if (P_kgHa > 3) {
      const mkp_ha = Math.min(20, Math.round(P_kgHa / 0.52));
      products.push({
        name: "MKP 0:52:34 (Mono Potassium Phosphate)",
        quantityKgPerHa: mkp_ha,
        quantityKgPerAcre: kgPerHaToKgPerAcre(mkp_ha),
        totalKgFarm: totalKgFarm(mkp_ha, acre),
        method,
        timing: "Morning 6–9 AM",
        note: "Critical for fruit set — apply 2x per week during flowering",
      });
    }
    if (K_kgHa > 5) {
      const sop_ha = Math.min(25, Math.round(K_kgHa / 0.5));
      products.push({
        name: "SOP 0:0:50 (Sulphate of Potash)",
        quantityKgPerHa: sop_ha,
        quantityKgPerAcre: kgPerHaToKgPerAcre(sop_ha),
        totalKgFarm: totalKgFarm(sop_ha, acre),
        method,
        timing: "Evening 4–6 PM",
        note: "Do NOT mix with Calcium Nitrate in same tank",
      });
    }
    // Calcium critical at flowering
    const cano3_ha = 10;
    products.push({
      name: "Calcium Nitrate 15.5:0:0 + 19% Ca",
      quantityKgPerHa: cano3_ha,
      quantityKgPerAcre: kgPerHaToKgPerAcre(cano3_ha),
      totalKgFarm: totalKgFarm(cano3_ha, acre),
      method,
      timing: "Separate tank / separate day from phosphate",
      note: "⚠️ INCOMPATIBLE with MKP/MAP — apply on different days",
    });
  }

  if (isFruiting) {
    // High K + Ca + Mg stage
    if (K_kgHa > 5) {
      const sop_ha = Math.min(30, Math.round(K_kgHa / 0.5));
      products.push({
        name: "SOP 0:0:50 (Sulphate of Potash)",
        quantityKgPerHa: sop_ha,
        quantityKgPerAcre: kgPerHaToKgPerAcre(sop_ha),
        totalKgFarm: totalKgFarm(sop_ha, acre),
        method,
        timing: "Evening",
        note: "Apply 3x per week during fruit development",
      });
    }
    products.push({
      name: "Calcium Nitrate 15.5:0:0 + 19% Ca",
      quantityKgPerHa: 12,
      quantityKgPerAcre: kgPerHaToKgPerAcre(12),
      totalKgFarm: totalKgFarm(12, acre),
      method,
      timing: "Alternate days, separate from phosphate",
      note: "Prevents blossom end rot, improves fruit quality",
    });
    products.push({
      name: "Magnesium Sulphate (Heptahydrate)",
      quantityKgPerHa: 10,
      quantityKgPerAcre: kgPerHaToKgPerAcre(10),
      totalKgFarm: totalKgFarm(10, acre),
      method: isDrip ? "Drip or foliar spray" : "Soil drench",
      timing: "Weekly once",
      note: "Prevents interveinal chlorosis",
    });
  }

  // Fallback: if no stage-specific products added
  if (products.length === 0) {
    const dose_ha = Math.min(25, Math.max(10, Math.round(Math.max(N_kgHa, P_kgHa, K_kgHa) / 0.19)));
    products.push({
      name: "NPK 19:19:19 (Water Soluble)",
      quantityKgPerHa: dose_ha,
      quantityKgPerAcre: Math.min(5, kgPerHaToKgPerAcre(dose_ha)),
      totalKgFarm: Math.min(5, kgPerHaToKgPerAcre(dose_ha)) * acre,
      method,
      timing: "Morning",
      note: "Split into 2 equal doses over 2 days",
    });
  }

  return products;
}

/**
 * MICRONUTRIENT RECOMMENDATION ENGINE
 * Based on NDRE, crop stage, soil pH context
 */
export function getMicronutrientRecommendations({ ndre, bbchStage, soilpH = 7, cropType, acre }) {
  const micros = [];
  const isDrip = true; // micronutrients mostly foliar or drip

  // Zinc — universal deficiency in Indian soils
  // NDRE < 0.2 = strong deficiency signal
  const znDeficient = (ndre != null && ndre < 0.25) || bbchStage < 60;
  if (znDeficient) {
    const znProduct = soilpH > 7.5 ? "Zinc EDTA Chelated 12%" : "Zinc Sulphate 21%";
    const znDose = soilpH > 7.5 ? 200 : 500; // g/acre
    micros.push({
      name: znProduct,
      quantityGPerAcre: znDose,
      totalGFarm: znDose * acre,
      method: "Foliar spray: 200 litre water/acre",
      timing: "Morning, weekly once",
      purpose: "Zinc deficiency correction — chlorosis, stunted growth",
      note: soilpH > 7.5 ? "Chelated form preferred for alkaline soil" : "",
    });
  }

  // Boron — critical at flowering
  if (bbchStage >= 35 && bbchStage <= 70) {
    micros.push({
      name: "Borax 20% / Boron 20 SL",
      quantityGPerAcre: 150,
      totalGFarm: 150 * acre,
      method: "Foliar spray: 0.75 g/litre, 200 litre/acre",
      timing: "Pre-flowering stage",
      purpose: "Improves pollination, fruit set, prevents hollow heart",
      note: "Apply before 10 AM or after 4 PM. Do NOT mix with calcium spray.",
    });
  }

  // Iron — NDRE signal
  if (ndre != null && ndre < 0.18) {
    const feProduct = soilpH > 7.5 ? "Fe-EDTA Chelated 6%" : "Ferrous Sulphate 19%";
    micros.push({
      name: feProduct,
      quantityGPerAcre: soilpH > 7.5 ? 100 : 500,
      totalGFarm: (soilpH > 7.5 ? 100 : 500) * acre,
      method: "Foliar spray: 200 litre water/acre",
      timing: "Morning",
      purpose: "Iron deficiency — interveinal chlorosis on young leaves",
    });
  }

  // Magnesium — fruiting stage universal
  if (bbchStage > 60) {
    micros.push({
      name: "Magnesium Sulphate (Foliar Grade)",
      quantityGPerAcre: 1000,
      totalGFarm: 1000 * acre,
      method: "Foliar spray: 5 g/litre, 200 litre/acre",
      timing: "Evening spray, fortnightly",
      purpose: "Mg deficiency — interveinal yellowing on older leaves",
    });
  }

  return micros;
}

/**
 * ORGANIC FERTIGATION — liquid/water-soluble organic inputs only
 * NO vermicompost, NO FYM, NO compost in fertigation
 */
function getOrganicFertigationProducts(N_kgHa, P_kgHa, K_kgHa, bbchStage, acre, isDrip) {
  const products = [];
  const method = isDrip ? "Drip fertigation or soil drench" : "Soil drench + immediate irrigation";

  // Jeevamrut — liquid fermented bio-inoculant (drip compatible)
  products.push({
    name: "Jeevamrut (liquid)",
    quantityLitrePerAcre: 200,
    totalLitreFarm: 200 * acre,
    method: isDrip ? "Mix 200L/acre in irrigation water, apply via drip" : "Soil drench, 200L/acre",
    timing: "Early morning",
    purpose: "Soil microbial activity, N-fixation, P solubilization",
    note: "Prepare fresh 7 days before use",
  });

  // Seaweed extract — growth promoter, K+micronutrients
  products.push({
    name: "Seaweed Extract (liquid 0.1:0.0:17)",
    quantityMLPerAcre: 1000,
    totalMLFarm: 1000 * acre,
    method: "Drip injection or foliar: 5ml/litre",
    timing: "Morning",
    purpose: "Cytokinin content — root growth, stress tolerance, natural K",
  });

  // Humic acid — P solubilization, CEC improvement
  if (bbchStage < 50) {
    products.push({
      name: "Humic Acid 12% liquid",
      quantityLitrePerAcre: 1,
      totalLitreFarm: 1 * acre,
      method: isDrip ? "Drip injection" : "Soil drench",
      timing: "Morning",
      purpose: "Improves nutrient uptake efficiency, soil structure",
    });
  }

  // Panchagavya — flowering stage
  if (bbchStage >= 35 && bbchStage <= 70) {
    products.push({
      name: "Panchagavya 3%",
      quantityLitrePerAcre: 2,
      totalLitreFarm: 2 * acre,
      method: "Foliar spray: 30ml/litre, 200 litre water/acre",
      timing: "Evening",
      purpose: "Flowering induction, fruit set improvement",
    });
  }

  return products;
}

export function getFertigationDecision(evidence) {
  const nutrientDeficit = evidence?.nutrientDeficit ?? {};
  const irrigationType = evidence?.irrigationType ?? "";
  const isDrip = irrigationType?.toLowerCase?.().includes("drip");
  const acre = evidence?.acre ?? 1;
  const bbchStage = evidence?.bbchStage ?? 0;
  const currentApplication = evidence?.fertilizerSchedule?.currentApplication ?? null;
  const ndre = evidence?.satelliteOpticalIndices?.ndre ?? null;
  const soilpH = evidence?.regionProfile?.soilpH ?? 7;
  const cropType = evidence?.cropType ?? "";

  const nDeficit = nutrientDeficit.nitrogenKgPerHa ?? 0;
  const pDeficit = nutrientDeficit.phosphorousKgPerHa ?? 0;
  const kDeficit = nutrientDeficit.potassiumKgPerHa ?? 0;
  const totalDeficit = nDeficit + pDeficit + kDeficit;
  const typeOfFarming = normalizeTypeOfFarming(evidence?.typeOfFarming);
  const hasNutrientData = evidence?.npkManagement?.required && evidence?.npkManagement?.available;

  // Micronutrient hints — always computed regardless of farming type
  const micronutrients = getMicronutrientRecommendations({
    ndre,
    bbchStage,
    soilpH,
    cropType,
    acre,
  });

  if (!hasNutrientData) {
    return {
      shouldFertigate: false,
      reason: "NPK baseline missing. Verify soil/fertilizer records before fertigation.",
      products: [],
      micronutrients,
      hint: {
        fertilizer: "",
        quantity: "",
        method: isDrip ? "Drip fertigation after validation" : "Broadcast with irrigation after validation",
        time: "After nutrient verification",
        nutrientDeficit: { n: nDeficit, p: pDeficit, k: kDeficit },
        micronutrients,
      },
    };
  }

  if (!currentApplication) {
    return {
      shouldFertigate: false,
      reason: `No fertigation window active at BBCH ${bbchStage}. Follow next scheduled stage.`,
      products: [],
      micronutrients,
      hint: {
        fertilizer: "",
        quantity: "",
        method: isDrip ? "Drip fertigation" : "Broadcast with irrigation",
        time: `Current BBCH ${bbchStage}. Next window upcoming.`,
        nutrientDeficit: { n: nDeficit, p: pDeficit, k: kDeficit },
        micronutrients,
      },
    };
  }

  if (totalDeficit <= 0) {
    return {
      shouldFertigate: false,
      reason: "Nutrients balanced. No macro-fertigation needed today.",
      products: [],
      micronutrients,
      hint: null,
    };
  }

  // ─── ORGANIC ───────────────────────────────────────
  if (typeOfFarming === "Organic") {
    const products = getOrganicFertigationProducts(nDeficit, pDeficit, kDeficit, bbchStage, acre, isDrip);
    const primaryProduct = products[0];
    return {
      shouldFertigate: true,
      reason: "Organic farm: liquid/bio inputs only through fertigation.",
      products,
      micronutrients,
      hint: {
        organicOnly: true,
        fertilizer: primaryProduct?.name ?? "Jeevamrut",
        quantity: primaryProduct?.quantityLitrePerAcre
          ? `${primaryProduct.quantityLitrePerAcre} L/acre (${primaryProduct.totalLitreFarm} L total)`
          : "",
        method: isDrip ? "Drip fertigation" : "Soil drench",
        time: `${currentApplication.stageLabel} (BBCH ${currentApplication.bbchWindow}); morning preferred`,
        nutrientDeficit: { n: nDeficit, p: pDeficit, k: kDeficit },
        allProducts: products,
        micronutrients,
        farmerSteps: [
          "Jeevamrut: dilute 200L in irrigation water",
          "Seaweed: 5ml/litre foliar spray",
          "Do not mix all products in one tank",
        ],
      },
    };
  }

  // ─── INORGANIC / INTEGRATED ─────────────────────────
  const waterSolubleProducts = selectWaterSolubleProducts(
    nDeficit, pDeficit, kDeficit, bbchStage, acre, isDrip
  );

  // For integrated: replace 50% chem with organic supplements
  let organicSupplement = [];
  if (typeOfFarming === "Integrated") {
    organicSupplement = [
      {
        name: "Humic Acid 12% liquid",
        quantityLitrePerAcre: 1,
        totalLitreFarm: acre,
        method: isDrip ? "Drip injection" : "Soil drench",
        timing: "Along with first fertigation of the week",
        purpose: "Nutrient uptake efficiency",
      },
      {
        name: "Seaweed Extract liquid",
        quantityMLPerAcre: 500,
        totalMLFarm: 500 * acre,
        method: "Drip or foliar",
        timing: "Weekly once",
        purpose: "Growth regulator, stress tolerance",
      },
    ];
  }

  const primaryProduct = waterSolubleProducts[0];
  const doseStr = primaryProduct?.quantityKgPerAcre
    ? `${primaryProduct.quantityKgPerAcre} kg/acre (total ${primaryProduct.totalKgFarm} kg)`
    : "";

  // Build compatibility warnings
  const hasCaNO3 = waterSolubleProducts.some((p) => p.name.includes("Calcium Nitrate"));
  const hasPhosphate = waterSolubleProducts.some((p) => p.name.includes("MKP") || p.name.includes("MAP") || p.name.includes("DAP"));
  const compatibilityWarning = hasCaNO3 && hasPhosphate
    ? "⚠️ Apply Calcium Nitrate and Phosphate products on SEPARATE days — they are incompatible in same tank."
    : "";

  return {
    shouldFertigate: true,
    reason:
      typeOfFarming === "Inorganic"
        ? "Chemical water-soluble fertigation based on deficit and crop stage."
        : "Integrated: water-soluble chemical + organic bio-inputs.",
    products: [...waterSolubleProducts, ...organicSupplement],
    micronutrients,
    hint: {
      fertilizer: primaryProduct?.name ?? "NPK 19:19:19",
      quantity: doseStr,
      method: isDrip ? "Dissolve fully; apply via drip system" : "Dissolve in water; soil drench + irrigate immediately",
      time: `${currentApplication.stageLabel} (BBCH ${currentApplication.bbchWindow}); Morning 6–10 AM`,
      nutrientDeficit: { n: nDeficit, p: pDeficit, k: kDeficit },
      allProducts: waterSolubleProducts,
      organicSupplement,
      micronutrients,
      compatibilityWarning,
      farmerSteps: [
        "Dissolve each product separately before mixing in tank",
        "Apply via drip: open valve, inject for scheduled duration",
        "Do NOT apply if rain expected within 4 hours",
        "Irrigate plain water for 15 min after fertigation to flush lines",
        ...(compatibilityWarning ? [compatibilityWarning] : []),
      ],
    },
  };
}
