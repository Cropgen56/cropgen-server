import { normalizeTypeOfFarming } from "../farmingTypeNormalize.js";

/**
 * Spray Decision Engine
 * Recommends spray ONLY when evidence supports it.
 * Skip if wind high or rain probability > 40%.
 */

/**
 * Determine if spray should be recommended based on evidence.
 * @param {Object} evidence - Structured evidence from evidenceBuilder
 * @returns {Object} { shouldSpray: boolean, hint: Object|null }
 */
export function getSprayDecision(evidence) {
  if (normalizeTypeOfFarming(evidence?.typeOfFarming) === "Organic") {
    return {
      shouldSpray: false,
      reason: "Organic farm - no chemical spray. Use neem oil, biopesticides per local organic practice.",
      hint: {
        organicAlternative: "Neem oil, biocontrol, or approved organic pesticides only",
      },
    };
  }

  const cropHealth = evidence?.cropHealth;
  const weather = evidence?.weatherForecast;
  const cropStage = evidence?.cropGrowthStage;
  const bbchStage = evidence?.bbchStage ?? 0;

  // Skip if wind high or rain probability > 40%
  const windSpeed = weather?.windSpeedToday ?? weather?.current?.windSpeed ?? 0;
  const rainLikely = weather?.rainProbabilityToday === "likely";
  const rainfall = Array.isArray(weather?.next7Days?.rainfall)
    ? weather.next7Days.rainfall[0]
    : 0;
  const rainHigh = rainfall > 10; // mm

  if (windSpeed > 15 || rainLikely || rainHigh) {
    return {
      shouldSpray: false,
      reason: "Wind high or rain expected. Skip spray today.",
      hint: null,
    };
  }

  // Conditions to recommend spray
  const healthIndicatesStress =
    cropHealth?.category === "Moderate" ||
    cropHealth?.category === "Poor" ||
    cropHealth?.category === "Critical";

  const sensitiveStages = [
    "Flowering",
    "Bud Formation",
    "Flower Initiation",
    "Fruit Development",
    "Vegetative",
  ];
  const isSensitiveStage = sensitiveStages.some(
    (s) => cropStage?.toLowerCase?.().includes(s?.toLowerCase?.())
  );

  if (!healthIndicatesStress && !isSensitiveStage) {
    return {
      shouldSpray: false,
      reason: "Crop health stable. No spray needed.",
      hint: null,
    };
  }

  // Hint for LLM: full product identity + numeric dose (inorganic / integrated farms)
  return {
    shouldSpray: true,
    reason: "Crop stress or sensitive stage. Consider preventive spray.",
    hint: {
      chemical:
        "State exact product: active ingredient + concentration + form (e.g. Mancozeb 75% WP, Imidacloprid 17.8% SL, Propiconazole 25% EC)",
      formulation: "Must match label form (WP/SC/EC/SL) with % active",
      quantityPerAcre:
        "Numeric only: g or ml per litre of spray water + total spray solution litres per acre (or per tank with tank size)",
      sprayTiming: "Morning or evening when wind is low",
      safetyInstruction: "Wear protective gear. Avoid spray during peak heat.",
    },
  };
}
