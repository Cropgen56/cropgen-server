import { normalizeTypeOfFarming } from "../farmingTypeNormalize.js";

/**
 * Fertigation Decision Engine - DYNAMIC recommendations
 * All quantities calculated from nutrient deficit, crop, growth stage, irrigation.
 * No fixed/static suggestions - every recommendation is farm-specific.
 *
 * Chemical: Urea 46%, DAP 18:46:0, MOP 60%, NPK 19:19:19, Zn EDTA 12%
 * Organic: Vermicompost, compost, jeevamruth, neem cake (quantities from deficit)
 * Chelated preferred when irrigationType = drip
 */

const MACRONUTRIENTS = {
  UREA: { name: "Urea 46%", n: 46, p: 0, k: 0 },
  DAP: { name: "DAP 18:46:0", n: 18, p: 46, k: 0 },
  MOP: { name: "MOP 60%", n: 0, p: 0, k: 60 },
  NPK_19_19_19: { name: "NPK 19:19:19", n: 19, p: 19, k: 19 },
  NPK_13_0_45: { name: "NPK 13:0:45", n: 13, p: 0, k: 45 },
  CALCIUM_NITRATE: { name: "Calcium Nitrate", n: 15, p: 0, k: 0 },
};

const MICRONUTRIENTS = {
  ZN_EDTA: { name: "Zn EDTA 12%", chelated: true },
  FE_EDTA: { name: "Fe EDTA 12%", chelated: true },
  BORON: { name: "Boron 20%", chelated: false },
  MG_SULPHATE: { name: "Magnesium sulphate", chelated: false },
};

/** Organic product specs: N, P, K % (elemental). Used to compute quantity from deficit. */
const ORGANIC_SPECS = {
  VERMICOMPOST: { name: "Vermicompost", n: 1.5, p: 1, k: 0.5, composition: "N ~1.5%, P ~1%, K ~0.5%" },
  COMPOST: { name: "Compost (FYM)", n: 0.75, p: 0.4, k: 0.75, composition: "N ~0.75%, P ~0.4%, K ~0.75%" },
  JEEVAMRUTH: { name: "Jeevamruth", n: 0.5, p: 0.2, k: 0.3, composition: "Liquid, N ~0.5%, microbes" },
  NEEM_CAKE: { name: "Neem cake", n: 5, p: 1, k: 1.5, composition: "N ~5%, P ~1%, K ~1.5%" },
  PONGAMIA_CAKE: { name: "Pongamia cake", n: 4, p: 1, k: 1.2, composition: "N ~4%, P ~1%, K ~1.2%" },
};

/** 1 ha = 2.471 acres (US survey) */
const HA_PER_ACRE = 1 / 2.471;
const ACRES_PER_HA = 2.471;

/**
 * Max product (fertilizer) kg/acre for ONE fertigation event — avoids “full deficit in one shot”.
 * Drip: lower (salinity, root safety). Open/broadcast: slightly higher.
 */
const MAX_KG_ACRE_DRIP = {
  NPK: 12,
  NPK_K: 12,
  UREA: 18,
  DAP: 12,
  MOP: 12,
};
const MAX_KG_ACRE_OPEN = {
  NPK: 18,
  NPK_K: 16,
  UREA: 25,
  DAP: 16,
  MOP: 16,
};

/** Vermicompost: cap per event (kg/acre material), drip vs broadcast */
const MAX_VC_KG_ACRE_DRIP = 35;
const MAX_VC_KG_ACRE_OPEN = 55;

function kgPerHaToKgPerAcre(kgPerHa) {
  const v = Number(kgPerHa) || 0;
  return Math.round((v / ACRES_PER_HA) * 10) / 10;
}

function totalKgForFarmFromKgPerHa(kgPerHa, acre) {
  return Math.round(kgPerHaToKgPerAcre(kgPerHa) * (Number(acre) || 1) * 10) / 10;
}

function capKgPerHaToMaxKgPerAcre(kgPerHa, maxKgPerAcre) {
  const raw = Number(kgPerHa) || 0;
  const maxKgPerHa = maxKgPerAcre * ACRES_PER_HA;
  const capped = Math.min(raw, maxKgPerHa);
  return {
    value: Math.round(capped * 10) / 10,
    wasCapped: capped + 1e-6 < raw,
  };
}

/** Flower/fruit stages: slightly lower single-shot NPK to reduce scorch / excess vegetative growth */
function fertigationStageMultiplier(cropStage) {
  const s = (cropStage || "").toLowerCase();
  if (
    s.includes("flower") ||
    s.includes("flowering") ||
    s.includes("fruit") ||
    s.includes("bud")
  ) {
    return 0.88;
  }
  if (s.includes("maturity") || s.includes("harvest") || s.includes("ripen")) {
    return 0.75;
  }
  return 1;
}

function capMacronutrientKgPerHa(quantityKgPerHa, key, isDrip) {
  const maxAcre = isDrip ? MAX_KG_ACRE_DRIP[key] : MAX_KG_ACRE_OPEN[key];
  return capKgPerHaToMaxKgPerAcre(quantityKgPerHa, maxAcre);
}

/**
 * Compute organic product quantity (kg or tons per ha) from deficit.
 * quantityKgPerHa = deficit / (nutrientPercent/100)
 */
function calcOrganicQtyFromDeficit(deficitKgPerHa, nutrientPercent) {
  if (!nutrientPercent || deficitKgPerHa <= 0) return 0;
  return Math.round((deficitKgPerHa / (nutrientPercent / 100)) * 10) / 10;
}

/**
 * Build dynamic organic product list from nutrient deficit.
 * Quantities computed from deficit; product selection by dominant nutrient.
 */
function getOrganicProductsForDeficit(nDeficit, pDeficit, kDeficit, acre, cropStage, isDrip) {
  const products = [];
  const totalDeficit = nDeficit + pDeficit + kDeficit;
  if (totalDeficit <= 0) return products;

  const areaHa = acre * HA_PER_ACRE;

  // Base: vermicompost - balanced, covers mixed deficit. Qty from limiting nutrient.
  const vcForN = nDeficit > 0 ? calcOrganicQtyFromDeficit(nDeficit, ORGANIC_SPECS.VERMICOMPOST.n) : 0;
  const vcForP = pDeficit > 0 ? calcOrganicQtyFromDeficit(pDeficit, ORGANIC_SPECS.VERMICOMPOST.p) : 0;
  const vcForK = kDeficit > 0 ? calcOrganicQtyFromDeficit(kDeficit, ORGANIC_SPECS.VERMICOMPOST.k) : 0;
  let vcKgPerHa = Math.max(vcForN, vcForP, vcForK, totalDeficit / 10);
  const vcCapAcre = isDrip ? MAX_VC_KG_ACRE_DRIP : MAX_VC_KG_ACRE_OPEN;
  const vcCapped = capKgPerHaToMaxKgPerAcre(vcKgPerHa, vcCapAcre);
  vcKgPerHa = vcCapped.value;
  const vcKgPerAcre = kgPerHaToKgPerAcre(vcKgPerHa);
  const vcTotalFarm = totalKgForFarmFromKgPerHa(vcKgPerHa, acre);

  products.push({
    name: ORGANIC_SPECS.VERMICOMPOST.name,
    composition: ORGANIC_SPECS.VERMICOMPOST.composition,
    quantityForAcre:
      vcKgPerAcre >= 1000
        ? `${(vcKgPerAcre / 1000).toFixed(2)} tons/acre`
        : `~${vcKgPerAcre} kg/acre (≈${vcTotalFarm} kg total for farm)`,
    quantityKgPerHa: vcKgPerHa,
    method: isDrip ? "Soil drench or apply through drip" : "Top-dress along rows, irrigate after",
    farmerSteps: [
      "Spread evenly along crop rows or around plant base",
      "Light incorporation with soil",
      "Irrigate immediately after application",
    ],
    reason: "Base organic nutrition (balanced NPK)",
  });

  // Add product for dominant deficit: ratio-based + minimum absolute (no fixed thresholds)
  const nRatio = totalDeficit > 0 ? nDeficit / totalDeficit : 0;
  const pRatio = totalDeficit > 0 ? pDeficit / totalDeficit : 0;
  const kRatio = totalDeficit > 0 ? kDeficit / totalDeficit : 0;
  const dominantN = nRatio > 0.4 && nDeficit > 5;
  const dominantP = pRatio > 0.4 && pDeficit > 4;
  const dominantK = kRatio > 0.4 && kDeficit > 4;

  if (dominantN) {
    const jeevLPerHa = Math.min(500, Math.round(nDeficit * 40));
    const jeevL = Math.round(jeevLPerHa * areaHa);
    products.push({
      name: ORGANIC_SPECS.JEEVAMRUTH.name,
      composition: ORGANIC_SPECS.JEEVAMRUTH.composition,
      quantityForAcre: `${jeevL} L diluted 1:10 with water`,
      quantityKgPerHa: jeevLPerHa,
      method: isDrip ? "Apply through drip system" : "Soil drench at plant base",
      farmerSteps: [
        `Dilute 1 part jeevamruth in 10 parts water (~${jeevL} L total)`,
        "Apply at plant base or through drip in morning",
        "Repeat every 15 days during vegetative stage",
      ],
      reason: "Nitrogen boost",
    });
  }
  if (dominantP) {
    const compKgPerHa = calcOrganicQtyFromDeficit(pDeficit, ORGANIC_SPECS.COMPOST.p);
    const compKgAcre = Math.round(Math.min(2000, Math.max(200, compKgPerHa * areaHa)));
    products.push({
      name: ORGANIC_SPECS.COMPOST.name,
      composition: ORGANIC_SPECS.COMPOST.composition,
      quantityForAcre: compKgAcre >= 1000 ? `${(compKgAcre / 1000).toFixed(1)} tons` : `${compKgAcre} kg`,
      quantityKgPerHa: compKgPerHa,
      method: "Broadcast and incorporate, or top-dress with irrigation",
      farmerSteps: [
        "Apply well-decomposed compost uniformly",
        "Light incorporation with soil",
        "Irrigate after application",
      ],
      reason: "Phosphorus from organic matter",
    });
  }
  if (dominantK) {
    const neemKgPerHa = calcOrganicQtyFromDeficit(kDeficit, ORGANIC_SPECS.NEEM_CAKE.k);
    const neemKgAcre = Math.round(Math.min(150, Math.max(40, neemKgPerHa * areaHa)));
    products.push({
      name: ORGANIC_SPECS.NEEM_CAKE.name,
      composition: ORGANIC_SPECS.NEEM_CAKE.composition,
      quantityForAcre: `${neemKgAcre} kg`,
      quantityKgPerHa: neemKgPerHa,
      method: "Top-dress or side-dress, avoid direct root contact",
      farmerSteps: [
        "Apply 4–6 inches from plant base",
        "Light irrigation after application",
        "Also helps pest/nematode control",
      ],
      reason: "Potassium + pest management",
    });
  }

  return products;
}

function finalizeChemicalKgPerHa(rawKgPerHa, capKey, isDrip, stageMult) {
  const scaled = Math.round((Number(rawKgPerHa) || 0) * stageMult);
  return capMacronutrientKgPerHa(scaled, capKey, isDrip);
}

/**
 * Inorganic farms: water-soluble / granular chemicals only (no vermicompost, jeevamruth, etc.).
 */
function buildChemicalOnlyFertigation(evidence, ctx) {
  const { nDeficit, pDeficit, kDeficit, totalDeficit, acre, cropStage, isDrip } = ctx;
  const nRatio = totalDeficit > 0 ? nDeficit / totalDeficit : 0;
  const pRatio = totalDeficit > 0 ? pDeficit / totalDeficit : 0;
  const kRatio = totalDeficit > 0 ? kDeficit / totalDeficit : 0;
  const stageMult = fertigationStageMultiplier(cropStage);

  const products = [];
  let inorganicCapped = false;
  if (nRatio > 0.6 && pRatio < 0.25 && kRatio < 0.25) {
    const raw = Math.round(nDeficit / 0.46);
    const { value, wasCapped } = finalizeChemicalKgPerHa(raw, "UREA", isDrip, stageMult);
    inorganicCapped ||= wasCapped;
    products.push({
      ...MACRONUTRIENTS.UREA,
      quantityKgPerHa: value,
      reason: "Nitrogen deficit dominant",
    });
  } else if (pRatio > 0.6 && nRatio < 0.25 && kRatio < 0.25) {
    const raw = Math.round(pDeficit / 0.46);
    const { value, wasCapped } = finalizeChemicalKgPerHa(raw, "DAP", isDrip, stageMult);
    inorganicCapped ||= wasCapped;
    products.push({
      ...MACRONUTRIENTS.DAP,
      quantityKgPerHa: value,
      reason: "Phosphorus deficit dominant",
    });
  } else if (kRatio > 0.6 && nRatio < 0.25 && pRatio < 0.25) {
    const raw = Math.round(kDeficit / 0.6);
    const { value, wasCapped } = finalizeChemicalKgPerHa(raw, "MOP", isDrip, stageMult);
    inorganicCapped ||= wasCapped;
    products.push({
      ...MACRONUTRIENTS.MOP,
      quantityKgPerHa: value,
      reason: "Potassium deficit dominant",
    });
  } else if (kDeficit > nDeficit && kDeficit > pDeficit && kRatio > 0.4) {
    const raw = Math.round(kDeficit / 0.45);
    const { value, wasCapped } = finalizeChemicalKgPerHa(raw, "NPK_K", isDrip, stageMult);
    inorganicCapped ||= wasCapped;
    products.push({
      ...MACRONUTRIENTS.NPK_13_0_45,
      quantityKgPerHa: value,
      reason: "Potassium-focused, balanced N",
    });
  } else {
    const maxDef = Math.max(nDeficit, pDeficit, kDeficit);
    const raw = Math.round(maxDef / 0.19);
    const { value, wasCapped } = finalizeChemicalKgPerHa(raw, "NPK", isDrip, stageMult);
    inorganicCapped ||= wasCapped;
    products.push({
      ...MACRONUTRIENTS.NPK_19_19_19,
      quantityKgPerHa: value,
      reason: "Balanced NPK feeding",
    });
  }

  const regionProfile = evidence?.regionProfile ?? {};
  const areaHa = acre * HA_PER_ACRE;
  if (regionProfile.commonDeficiencies?.includes?.("zinc") && isDrip) {
    const znKgPerHa = 2.5;
    const znPerAcre = znKgPerHa * areaHa;
    products.push({
      ...MICRONUTRIENTS.ZN_EDTA,
      quantityKgPerHa: znKgPerHa,
      quantityPerAcre: znPerAcre >= 1 ? `${znPerAcre.toFixed(1)} kg` : `${Math.round(znPerAcre * 1000)} g`,
      reason: "Regional zinc deficiency, chelated for drip",
    });
  }

  const fertilizerList = products.map((p) => p.name).join(", ");
  const quantityList = products
    .map((p) => {
      if (p.quantityPerAcre) return `${p.name}: ${p.quantityPerAcre}`;
      return `${p.name}: ~${kgPerHaToKgPerAcre(p.quantityKgPerHa)} kg/acre (≈${totalKgForFarmFromKgPerHa(p.quantityKgPerHa, acre)} kg this farm)`;
    })
    .join("; ");
  const methodDrip =
    "Dissolve in water; apply through drip system. Run drip 30–45 min after injection.";
  const methodOpen = "Broadcast evenly; apply with irrigation water. Avoid foliar contact.";

  return {
    shouldFertigate: true,
    reason: "Inorganic farm: chemical fertilizers only (no organic manures in this plan).",
    products,
    hint: {
      inorganicOnly: true,
      fertilizer: fertilizerList,
      quantity: quantityList,
      method: isDrip ? methodDrip : methodOpen,
      time: "Morning (6–10 AM): dissolve product, then fertigate or broadcast with irrigation.",
      nutrientDeficit: { n: nDeficit, p: pDeficit, k: kDeficit },
      cropStage,
      cropType: evidence?.cropType ?? null,
      preferChelated: isDrip ? "Use chelated forms (Zn EDTA, Fe EDTA) for drip" : null,
      splitDoseNote: inorganicCapped
        ? "Today's rate is a safe single-event dose; repeat after 7–14 days or next check — do not apply full deficit in one day."
        : null,
      farmerSteps: [
        isDrip
          ? "Dissolve fertilizer in bucket; inject into drip line. Run irrigation 30–45 min."
          : "Broadcast fertilizer evenly. Irrigate immediately. Do not let fertilizer stay on leaves.",
        "Avoid application if heavy rain expected in 24 hours",
        "Store unused fertilizer in a dry place",
      ],
      formulation: products.map((p) => ({ name: p.name, reason: p.reason })),
    },
  };
}

/**
 * Get fertigation recommendation based on nutrient deficit.
 * @param {Object} evidence - Structured evidence
 * @returns {Object} { shouldFertigate, products, hint } - hint has full details for LLM
 */
export function getFertigationDecision(evidence) {
  const nutrientDeficit = evidence?.nutrientDeficit ?? {};
  const irrigationType = evidence?.irrigationType ?? "";
  const isDrip = irrigationType?.toLowerCase?.().includes("drip");
  const acre = evidence?.acre ?? 1;

  const nDeficit = nutrientDeficit.nitrogenKgPerHa ?? 0;
  const pDeficit = nutrientDeficit.phosphorousKgPerHa ?? 0;
  const kDeficit = nutrientDeficit.potassiumKgPerHa ?? 0;
  const totalDeficit = nDeficit + pDeficit + kDeficit;

  const cropStage = evidence?.cropGrowthStage ?? "";
  const typeOfFarming = normalizeTypeOfFarming(evidence?.typeOfFarming);

  const ctx = { nDeficit, pDeficit, kDeficit, totalDeficit, acre, cropStage, isDrip };

  if (totalDeficit <= 0) {
    return {
      shouldFertigate: false,
      reason: "Nutrients balanced. No fertigation needed today.",
      products: [],
      hint: null,
    };
  }

  if (typeOfFarming === "Organic") {
    const organicProducts = getOrganicProductsForDeficit(
      nDeficit,
      pDeficit,
      kDeficit,
      acre,
      cropStage,
      isDrip,
    );
    return {
      shouldFertigate: true,
      reason: "Organic farm: use only organic inputs.",
      products: organicProducts,
      hint: {
        organicOnly: true,
        nutrientDeficit: { n: nDeficit, p: pDeficit, k: kDeficit },
        cropStage,
        cropType: evidence?.cropType ?? null,
        products: organicProducts.map((p) => ({
          name: p.name,
          composition: p.composition,
          quantity: p.quantityForAcre,
          method: p.method,
          farmerSteps: p.farmerSteps,
          reason: p.reason,
        })),
        time: "Morning irrigation preferred (before 10 AM)",
        method: isDrip ? "Soil drench or drip application" : "Top-dress with irrigation",
        farmerSteps: [
          "Apply organic inputs in calculated quantity",
          "Irrigate immediately after application",
          "Avoid application during peak heat",
        ],
      },
    };
  }

  if (typeOfFarming === "Inorganic") {
    return buildChemicalOnlyFertigation(evidence, ctx);
  }

  // Integrated: organic base + limited chemical
  const chemShare = totalDeficit < 20 ? 0.3 : totalDeficit < 40 ? 0.5 : 0.6;
  const stageMult = fertigationStageMultiplier(cropStage);
  const chemProducts = [];
  let integratedChemCapped = false;
  if (nDeficit > 0 && pDeficit <= 5 && kDeficit <= 5) {
    const raw = Math.round((nDeficit / 0.46) * chemShare);
    const { value, wasCapped } = finalizeChemicalKgPerHa(raw, "UREA", isDrip, stageMult);
    integratedChemCapped ||= wasCapped;
    chemProducts.push({
      ...MACRONUTRIENTS.UREA,
      quantityKgPerHa: value,
      reason: `Nitrogen (${Math.round(chemShare * 100)}% chemical, rest organic)`,
    });
  } else if (pDeficit > 0 && nDeficit <= 5 && kDeficit <= 5) {
    const raw = Math.round((pDeficit / 0.46) * chemShare);
    const { value, wasCapped } = finalizeChemicalKgPerHa(raw, "DAP", isDrip, stageMult);
    integratedChemCapped ||= wasCapped;
    chemProducts.push({
      ...MACRONUTRIENTS.DAP,
      quantityKgPerHa: value,
      reason: `Phosphorus (${Math.round(chemShare * 100)}% chemical)`,
    });
  } else if (kDeficit > 0 && nDeficit <= 5 && pDeficit <= 5) {
    const raw = Math.round((kDeficit / 0.6) * chemShare);
    const { value, wasCapped } = finalizeChemicalKgPerHa(raw, "MOP", isDrip, stageMult);
    integratedChemCapped ||= wasCapped;
    chemProducts.push({
      ...MACRONUTRIENTS.MOP,
      quantityKgPerHa: value,
      reason: `Potassium (${Math.round(chemShare * 100)}% chemical)`,
    });
  } else {
    const maxDef = Math.max(nDeficit, pDeficit, kDeficit);
    const raw = Math.round((maxDef / 0.19) * chemShare);
    const { value, wasCapped } = finalizeChemicalKgPerHa(raw, "NPK", isDrip, stageMult);
    integratedChemCapped ||= wasCapped;
    chemProducts.push({
      ...MACRONUTRIENTS.NPK_19_19_19,
      quantityKgPerHa: value,
      reason: `Balanced NPK (${Math.round(chemShare * 100)}% chemical)`,
    });
  }

  const regionProfile = evidence?.regionProfile ?? {};
  const areaHa = acre * HA_PER_ACRE;
  if (regionProfile.commonDeficiencies?.includes?.("zinc") && isDrip) {
    const znKgPerHa = 2.5;
    const znPerAcre = znKgPerHa * areaHa;
    chemProducts.push({
      ...MICRONUTRIENTS.ZN_EDTA,
      quantityKgPerHa: znKgPerHa,
      quantityPerAcre: znPerAcre >= 1 ? `${znPerAcre.toFixed(1)} kg` : `${Math.round(znPerAcre * 1000)} g`,
      reason: "Regional zinc deficiency, chelated for drip",
    });
  }

  const organicProducts = getOrganicProductsForDeficit(
    nDeficit * (1 - chemShare),
    pDeficit * (1 - chemShare),
    kDeficit * (1 - chemShare),
    acre,
    cropStage,
    isDrip,
  );
  return {
    shouldFertigate: true,
    reason: "Integrated: organic base + limited chemical.",
    products: [...organicProducts, ...chemProducts],
    hint: {
      integrated: true,
      chemicalSharePercent: Math.round(chemShare * 100),
      cropType: evidence?.cropType ?? null,
      nutrientDeficit: { n: nDeficit, p: pDeficit, k: kDeficit },
      organicPortion: organicProducts.map((p) => ({
        name: p.name,
        composition: p.composition,
        quantity: p.quantityForAcre,
        method: p.method,
      })),
      chemicalPortion: chemProducts.map((p) => ({
        name: p.name,
        quantityPerAcre: p.quantityPerAcre
          ? `${p.quantityPerAcre} (this farm)`
          : `~${kgPerHaToKgPerAcre(p.quantityKgPerHa)} kg/acre (≈${totalKgForFarmFromKgPerHa(p.quantityKgPerHa, acre)} kg total)`,
        method: isDrip ? "Apply through drip system" : "Broadcast with irrigation",
      })),
      sequence: "First apply organic. Then apply chemical with irrigation.",
      time: "Morning irrigation preferred (6–10 AM); align chemical injection with same drip window.",
      splitDoseNote: integratedChemCapped
        ? "Chemical dose is limited to a safe single-event rate; cover remaining deficit over later irrigations (typically 7–14 days apart)."
        : null,
      farmerSteps: [
        "Apply organic inputs first",
        "Irrigate lightly; then apply chemical fertilizer",
        isDrip ? "Dissolve chemical, inject into drip" : "Broadcast chemical with irrigation",
      ],
    },
  };
}
