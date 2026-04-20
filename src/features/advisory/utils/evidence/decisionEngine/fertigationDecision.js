import { normalizeTypeOfFarming } from "../../shared/farmingTypeNormalize.js";

const ACRES_PER_HA = 2.471;

function kgPerHaToKgPerAcre(kgPerHa) {
  const v = Number(kgPerHa) || 0;
  return Math.round((v / ACRES_PER_HA) * 10) / 10;
}

function totalKgForFarmFromKgPerHa(kgPerHa, acre) {
  return Math.round(kgPerHaToKgPerAcre(kgPerHa) * (Number(acre) || 1) * 10) / 10;
}

export function getFertigationDecision(evidence) {
  const nutrientDeficit = evidence?.nutrientDeficit ?? {};
  const irrigationType = evidence?.irrigationType ?? "";
  const isDrip = irrigationType?.toLowerCase?.().includes("drip");
  const acre = evidence?.acre ?? 1;

  const nDeficit = nutrientDeficit.nitrogenKgPerHa ?? 0;
  const pDeficit = nutrientDeficit.phosphorousKgPerHa ?? 0;
  const kDeficit = nutrientDeficit.potassiumKgPerHa ?? 0;
  const totalDeficit = nDeficit + pDeficit + kDeficit;
  const typeOfFarming = normalizeTypeOfFarming(evidence?.typeOfFarming);

  if (totalDeficit <= 0) {
    return {
      shouldFertigate: false,
      reason: "Nutrients balanced. No fertigation needed today.",
      products: [],
      hint: null,
    };
  }

  if (typeOfFarming === "Organic") {
    const vcKgPerHa = Math.max(150, Math.round(totalDeficit * 40));
    return {
      shouldFertigate: true,
      reason: "Organic farm: use only organic inputs.",
      products: [
        {
          name: "Vermicompost",
          quantityKgPerHa: vcKgPerHa,
        },
      ],
      hint: {
        organicOnly: true,
        fertilizer: "Vermicompost",
        quantity: `~${kgPerHaToKgPerAcre(vcKgPerHa)} kg/acre (≈${totalKgForFarmFromKgPerHa(vcKgPerHa, acre)} kg total)`,
        method: isDrip ? "Soil drench or drip application" : "Top-dress with irrigation",
        time: "Morning irrigation preferred (before 10 AM)",
        nutrientDeficit: { n: nDeficit, p: pDeficit, k: kDeficit },
      },
    };
  }

  const maxDef = Math.max(nDeficit, pDeficit, kDeficit);
  const npkDoseKgPerHa = Math.max(20, Math.round(maxDef / 0.19));
  return {
    shouldFertigate: true,
    reason:
      typeOfFarming === "Inorganic"
        ? "Inorganic farm: chemical fertilizers only."
        : "Integrated: combine organic and chemical inputs.",
    products: [
      {
        name: "NPK 19:19:19",
        quantityKgPerHa: npkDoseKgPerHa,
      },
    ],
    hint: {
      fertilizer: "NPK 19:19:19",
      quantity: `~${kgPerHaToKgPerAcre(npkDoseKgPerHa)} kg/acre (≈${totalKgForFarmFromKgPerHa(npkDoseKgPerHa, acre)} kg total)`,
      method: isDrip ? "Apply through drip system" : "Broadcast with irrigation",
      time: "Morning (6–10 AM)",
      nutrientDeficit: { n: nDeficit, p: pDeficit, k: kDeficit },
      farmerSteps: [
        "Apply in split doses",
        "Irrigate immediately after application",
      ],
    },
  };
}
