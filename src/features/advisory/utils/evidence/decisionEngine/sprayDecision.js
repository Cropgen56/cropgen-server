import { normalizeTypeOfFarming } from "../../shared/farmingTypeNormalize.js";

function getSprayOptions({ category, hotDry }) {
  const fungal = {
    name: "Mancozeb 75% WP",
    dose: "2 g/L water",
    purpose: "Preventive fungal protection",
    purposeKey: "spray_purpose_fungal_preventive",
  };
  const systemicFungal = {
    name: "Propiconazole 25% EC",
    dose: "1 ml/L water",
    purpose: "Systemic fungal control",
    purposeKey: "spray_purpose_fungal_systemic",
  };
  const suckingPest = {
    name: "Imidacloprid 17.8% SL",
    dose: "0.3 ml/L water",
    purpose: "Sucking pest management",
    purposeKey: "spray_purpose_sucking",
  };
  const chewingPest = {
    name: "Emamectin Benzoate 5% SG",
    dose: "0.4 g/L water",
    purpose: "Caterpillar/chewing pest management",
    purposeKey: "spray_purpose_chewing",
  };

  if (category === "Critical") {
    return [systemicFungal, chewingPest, suckingPest];
  }
  if (category === "Poor") {
    return [fungal, systemicFungal, suckingPest];
  }
  if (hotDry) {
    return [suckingPest, fungal, chewingPest];
  }
  return [fungal, suckingPest, chewingPest];
}

export function getSprayDecision(evidence) {
  if (normalizeTypeOfFarming(evidence?.typeOfFarming) === "Organic") {
    return {
      shouldSpray: false,
      reason:
        "Organic farm - no chemical spray. Use neem oil, biopesticides per local organic practice.",
      reasonKey: "decision_organic_no_spray",
      hint: {
        organicAlternative:
          "Neem oil, biocontrol, or approved organic pesticides only",
      },
    };
  }

  const cropHealth = evidence?.cropHealth;
  const weather = evidence?.weatherForecast;
  const cropStage = evidence?.cropGrowthStage;

  const windSpeed = weather?.windSpeedToday ?? weather?.current?.windSpeed ?? 0;
  const rainLikely = weather?.rainProbabilityToday === "likely";
  const rainfall = Array.isArray(weather?.next7Days?.rainfall)
    ? weather.next7Days.rainfall[0]
    : 0;
  const rainHigh = rainfall > 10;
  const hotDry = (weather?.current?.temp ?? 0) >= 35 && (weather?.current?.humidity ?? 60) <= 35;

  if (windSpeed > 15 || rainLikely || rainHigh) {
    return {
      shouldSpray: false,
      reason: "Wind high or rain expected. Skip spray today.",
      reasonKey: "decision_wind_rain_no_spray",
      hint: null,
    };
  }

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
  const isSensitiveStage = sensitiveStages.some((s) =>
    cropStage?.toLowerCase?.().includes(s?.toLowerCase?.()),
  );

  if (!healthIndicatesStress && !isSensitiveStage) {
    return {
      shouldSpray: false,
      reason: "Crop health stable. No spray needed.",
      reasonKey: "decision_stable_no_spray",
      hint: null,
    };
  }

  return {
    shouldSpray: true,
    reason: "Crop stress or sensitive stage. Consider preventive spray.",
    reasonKey: "decision_stress_spray",
    hint: {
      message:
        "Choose one option based on observed pest/disease symptoms and local label guidance.",
      messageKey: "decision_spray_choose",
      products: getSprayOptions({
        category: cropHealth?.category,
        hotDry,
      }),
      method: "Foliar spray with uniform canopy coverage",
      methodKey: "spray_method_canopy",
      timing: "Early morning or late evening when wind is low",
      timingKey: "spray_timing_low_wind",
      notes: [
        "Use one option at a time; do not tank-mix without compatibility guidance.",
        "Follow label PHI/REI and local agronomy advisory.",
        "Wear protective gear and avoid spraying during peak heat.",
      ],
      notesKeys: ["spray_note_one_option", "spray_note_label", "spray_note_ppe"],
    },
  };
}
