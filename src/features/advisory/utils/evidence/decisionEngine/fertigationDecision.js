import { normalizeTypeOfFarming } from "../../shared/farmingTypeNormalize.js";
import { resolveIrrigationFamily } from "../../../../../constants/farmEnums.js";

const ACRES_PER_HA = 2.471;

function kgPerHaToKgPerAcre(kgPerHa) {
  const v = Number(kgPerHa) || 0;
  return Math.round((v / ACRES_PER_HA) * 10) / 10;
}

function totalKgForFarmFromKgPerHa(kgPerHa, acre) {
  return Math.round(kgPerHaToKgPerAcre(kgPerHa) * (Number(acre) || 1) * 10) / 10;
}

function formatProductsFromSchedule(products, acre) {
  if (!Array.isArray(products) || !products.length) return null;
  const lines = products.map((p) => {
    const perAcre = p.quantityKgPerAcre ?? kgPerHaToKgPerAcre(p.quantityKgPerHa);
    const total = p.totalKgFarm ?? totalKgForFarmFromKgPerHa(p.quantityKgPerHa, acre);
    return `${p.name}: ${perAcre} kg/acre (~${total} kg total)`;
  });
  return {
    fertilizer: products.map((p) => p.name).join(" + "),
    quantity: lines.join("; "),
    products,
  };
}

export function getFertigationDecision(evidence) {
  const nutrientDeficit = evidence?.nutrientDeficit ?? {};
  const irrigationType = evidence?.irrigationType ?? "";
  const isDrip = resolveIrrigationFamily(irrigationType) === "drip";
  const acre = evidence?.acre ?? 1;
  const bbchStage = evidence?.bbchStage ?? 0;
  const currentApplication = evidence?.fertilizerSchedule?.currentApplication ?? null;

  const nDeficit = nutrientDeficit.nitrogenKgPerHa ?? 0;
  const pDeficit = nutrientDeficit.phosphorousKgPerHa ?? 0;
  const kDeficit = nutrientDeficit.potassiumKgPerHa ?? 0;
  const totalDeficit = nDeficit + pDeficit + kDeficit;
  const typeOfFarming = normalizeTypeOfFarming(evidence?.typeOfFarming);
  const hasNutrientData =
    evidence?.npkManagement?.required && evidence?.npkManagement?.available;

  if (!hasNutrientData) {
    return {
      shouldFertigate: false,
      reason:
        "NPK baseline missing. Check soil/fertilizer records before fertigation.",
      products: [],
      hint: {
        fertilizer: "",
        quantity: "",
        method: isDrip
          ? "Drip fertigation after validation"
          : "Broadcast with irrigation after validation",
        time: "After nutrient verification",
        nutrientDeficit: { n: nDeficit, p: pDeficit, k: kDeficit },
      },
    };
  }

  if (!currentApplication) {
    return {
      shouldFertigate: false,
      reason: "No fertigation window for current BBCH stage.",
      products: [],
      hint: {
        fertilizer: "",
        quantity: "",
        method: isDrip ? "Drip fertigation" : "Broadcast with irrigation",
        time: `Current BBCH stage ${bbchStage}. Follow next scheduled stage.`,
        nutrientDeficit: { n: nDeficit, p: pDeficit, k: kDeficit },
      },
    };
  }

  if (totalDeficit <= 0) {
    return {
      shouldFertigate: false,
      reason: "Nutrients balanced. No fertigation needed today.",
      products: [],
      hint: null,
    };
  }

  const scheduleProducts = formatProductsFromSchedule(
    currentApplication.products,
    acre,
  );

  if (scheduleProducts) {
    return {
      shouldFertigate: true,
      reason: `Apply ${currentApplication.stageLabel} nutrients per crop schedule.`,
      products: scheduleProducts.products,
      hint: {
        fertilizer: scheduleProducts.fertilizer,
        quantity: scheduleProducts.quantity,
        method:
          currentApplication.application ||
          (isDrip ? "Drip fertigation" : "Broadcast + irrigate"),
        time: `${currentApplication.timing} (BBCH ${currentApplication.bbchWindow})`,
        nutrientDeficit: { n: nDeficit, p: pDeficit, k: kDeficit },
        farmerSteps: [
          "Split dose if total exceeds 50 kg/acre",
          "Irrigate within 2 hours after application",
        ],
      },
    };
  }

  if (typeOfFarming === "Organic") {
    const vcKgPerHa = Math.max(150, Math.round(totalDeficit * 40));
    return {
      shouldFertigate: true,
      reason: "Organic farm: use only organic inputs.",
      products: [{ name: "Vermicompost", quantityKgPerHa: vcKgPerHa }],
      hint: {
        organicOnly: true,
        fertilizer: "Vermicompost",
        quantity: `~${kgPerHaToKgPerAcre(vcKgPerHa)} kg/acre (≈${totalKgForFarmFromKgPerHa(vcKgPerHa, acre)} kg total)`,
        method: isDrip
          ? "Soil drench or drip application"
          : "Top-dress with irrigation",
        time: `${currentApplication.stageLabel} (BBCH ${currentApplication.bbchWindow}); morning (6-10 AM)`,
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
        ? "Inorganic farm: chemical fertilizers per deficit."
        : "Integrated: combine organic and chemical inputs per schedule.",
    products: [{ name: "NPK 19:19:19", quantityKgPerHa: npkDoseKgPerHa }],
    hint: {
      fertilizer: "NPK 19:19:19",
      quantity: `~${kgPerHaToKgPerAcre(npkDoseKgPerHa)} kg/acre (≈${totalKgForFarmFromKgPerHa(npkDoseKgPerHa, acre)} kg total)`,
      method: isDrip ? "Apply through drip system" : "Broadcast with irrigation",
      time: `${currentApplication.stageLabel} (BBCH ${currentApplication.bbchWindow}); morning (6-10 AM)`,
      nutrientDeficit: { n: nDeficit, p: pDeficit, k: kDeficit },
      farmerSteps: ["Apply in split doses", "Irrigate immediately after application"],
    },
  };
}
