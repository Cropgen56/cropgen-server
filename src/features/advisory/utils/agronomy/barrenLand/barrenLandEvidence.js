import { CROP_CATEGORY_MAP } from "../../../../../utils/crop/growth/cropCategoryMap.js";
import { soilMoistureToPercent } from "../../evidence/irrigationCalculator.js";
import {
  daysUntilSowing,
  getPreSowingPhase,
} from "./barrenLandScheduling.js";
import { formatDateISO } from "../../shared/helpers.js";
import {
  normalizeAdvisoryLanguage,
  t,
} from "../../i18n/advisoryLocale.js";

function normalizeCropName(name) {
  return (name || "").toLowerCase().replace(/[^a-z]/g, "");
}

function sumRain(arr, count = 7) {
  if (!Array.isArray(arr)) return 0;
  return arr.slice(0, count).reduce((s, v) => s + (Number(v) || 0), 0);
}

function assessSowingWindow(weatherSummary, daysUntil, language = "en") {
  const lang = normalizeAdvisoryLanguage(language);
  const rain3 = sumRain(weatherSummary?.next7Days?.rainfall, 3);
  const rain7 = sumRain(weatherSummary?.next7Days?.rainfall, 7);
  const temps = weatherSummary?.next7Days?.tempMax || [];
  const tempMax3 = temps.slice(0, 3).map(Number).filter(Number.isFinite);
  const maxT = tempMax3.length ? Math.max(...tempMax3) : null;

  if (daysUntil != null && daysUntil < 0) {
    return {
      suitable: false,
      urgency: "high",
      reason: t("barren_sowing_passed", lang),
      rain3dMm: rain3,
      rain7dMm: rain7,
    };
  }

  if (rain3 >= 40) {
    return {
      suitable: false,
      urgency: daysUntil != null && daysUntil <= 7 ? "high" : "moderate",
      reason: t("barren_heavy_rain", lang),
      rain3dMm: rain3,
      rain7dMm: rain7,
    };
  }

  if (maxT != null && maxT >= 42) {
    return {
      suitable: false,
      urgency: "moderate",
      reason: t("barren_heat", lang),
      rain3dMm: rain3,
      rain7dMm: rain7,
    };
  }

  if (daysUntil != null && daysUntil <= 7 && rain3 >= 15) {
    return {
      suitable: false,
      urgency: "high",
      reason: t("barren_rain_sowing_week", lang),
      rain3dMm: rain3,
      rain7dMm: rain7,
    };
  }

  if (daysUntil != null && daysUntil <= 14 && rain7 < 8 && rain3 < 10) {
    return {
      suitable: true,
      urgency: "moderate",
      reason: t("barren_dry_window", lang),
      rain3dMm: rain3,
      rain7dMm: rain7,
    };
  }

  return {
    suitable: true,
    urgency: "low",
    reason: t("barren_monitor_weekly", lang),
    rain3dMm: rain3,
    rain7dMm: rain7,
  };
}

function buildLandPrepHint(phase, farmField, sowingWindow) {
  const crop = farmField?.cropName || "crop";
  const farming = farmField?.typeOfFarming || "Integrated";

  const tasks = {
    planning: [
      "Remove previous crop stubble and weeds.",
      "Test soil if not done in the last 2 years (pH, organic carbon).",
      `Plan seed and inputs for ${crop} (${farmField?.variety || "variety"}).`,
    ],
    preparation: [
      "Primary tillage and leveling; ensure drainage in low spots.",
      "Incorporate well-decomposed FYM/compost if organic or integrated farming.",
      "Arrange seed treatment and basal fertilizer for sowing week.",
    ],
    imminent: [
      "Final seedbed: fine tilth, moisture at sowing depth.",
      "Pre-sowing irrigation if soil is dry (avoid waterlogging before sowing).",
      "Treat seed as per crop protocol; keep sowing equipment ready.",
    ],
    sowing_day: [
      "Sow when soil moisture is adequate and no heavy rain in next 48 hours.",
      "Apply basal dose at sowing as per crop recommendation.",
      "Record actual sowing date in the app after completion.",
    ],
    overdue: [
      "Field is past expected sowing date — scout for weeds and pest buildup on bare soil.",
      "Update expected sowing date or sow immediately if variety window still allows.",
    ],
  };

  const list = tasks[phase] || tasks.planning;
  if (farming === "Organic") {
    list.push("Use only approved organic inputs for weed control and nutrition.");
  }

  return {
    shouldAct: true,
    phase,
    tasks: list,
    message: list.join(" "),
    sowingWindowNote: sowingWindow.reason,
  };
}

function buildBasalFertigationHint(farmField, phase, language = "en") {
  const lang = normalizeAdvisoryLanguage(language);
  const crop = farmField?.cropName || "crop";
  const acre = farmField?.acre ?? 1;
  const shouldFertigate = phase === "imminent" || phase === "sowing_day" || phase === "overdue";

  if (!shouldFertigate) {
    return {
      shouldFertigate: false,
      reason: t("barren_fert_plan", lang, { crop }),
      hint: {
        fertilizer: "Plan basal (DAP/Urea/MOP or FYM)",
        quantity: `As per ${crop} recommendation for ${acre} acre`,
        time: "1–3 days before sowing or at sowing",
      },
    };
  }

  return {
    shouldFertigate: true,
    reason: t("barren_fert_active", lang, { crop }),
    hint: {
      fertilizer: "Basal dose (soil application)",
      quantity: `Full basal for ${acre} acre at sowing; split if soil is heavy`,
      time: "At sowing or 1 day before with light irrigation",
      method: "Broadcast and incorporate in seedbed or band below seed",
    },
    products: [
      { name: "Well-decomposed FYM", dose: "5–10 t/acre (if integrated/organic)" },
      { name: "DAP / SSP", dose: "As per soil test and crop schedule" },
    ],
  };
}

function buildSprayHint(phase, weatherSummary, language = "en") {
  const lang = normalizeAdvisoryLanguage(language);
  const rain3 = sumRain(weatherSummary?.next7Days?.rainfall, 3);
  const shouldSpray =
    phase === "planning" || phase === "preparation" || phase === "overdue";

  if (!shouldSpray) {
    return {
      shouldSpray: false,
      reason: t("barren_no_spray", lang),
    };
  }

  if (rain3 >= 20) {
    return {
      shouldSpray: false,
      reason: t("barren_spray_rain_delay", lang),
    };
  }

  return {
    shouldSpray: true,
    reason: t("barren_spray_consider", lang),
    hint: {
      message: t("barren_spray_hint", lang),
      products: [{ name: "As per local extension / weed spectrum", dose: "label rate" }],
      method: "Ground spray on weed foliage or mechanical",
      timing: "Morning, wind < 10 km/h, 5–7 days before sowing if chemical used",
    },
  };
}

function buildIrrigationHint(soilMoisturePercent, phase, rainfall7d, language = "en") {
  const lang = normalizeAdvisoryLanguage(language);
  const dry = soilMoisturePercent != null && soilMoisturePercent < 35;
  const shouldIrrigate =
    dry && (phase === "imminent" || phase === "sowing_day" || phase === "preparation");

  if (!shouldIrrigate) {
    return {
      shouldIrrigate: false,
      reason: dry
        ? t("barren_irr_dry_optional", lang)
        : t("barren_irr_ok", lang),
      hint: { message: t("barren_irr_pre_sowing_only", lang) },
    };
  }

  if (rainfall7d >= 25) {
    return {
      shouldIrrigate: false,
      reason: t("barren_irr_rain_hold", lang),
    };
  }

  return {
    shouldIrrigate: true,
    reason: t("barren_irr_dry_sow", lang),
    hint: {
      message: t("barren_irr_light", lang),
      method: "Pre-sowing / seedbed wetting",
      quantity: "Light — avoid runoff",
    },
  };
}

function buildSeedTreatmentHint(cropKey, phase) {
  const shouldTreat = phase === "imminent" || phase === "sowing_day";
  return {
    shouldTreat,
    reason: shouldTreat
      ? "Treat seed before sowing to reduce soil-borne and early pest issues."
      : "Seed treatment is done 1–2 days before sowing.",
    hint: {
      products: [
        { name: "Fungicide seed treatment", dose: "as per label" },
        { name: "Rhizobium / Trichoderma (if applicable)", dose: "as per crop" },
      ],
      timing: "24 hours before sowing",
    },
  };
}

export function buildBarrenLandPlantGrowth(
  farmField,
  expectedSowingISO,
  language = "en",
) {
  const lang = normalizeAdvisoryLanguage(language);
  const days = daysUntilSowing(expectedSowingISO);
  const phase = getPreSowingPhase(days);
  const crop = farmField?.cropName || "crop";

  const phaseLabels = {
    en: {
      planning: "Land planning",
      preparation: "Land preparation",
      imminent: "Pre-sowing (sowing soon)",
      sowing_day: "Sowing day",
      overdue: "Sowing overdue",
    },
    hi: {
      planning: "जमीन की योजना",
      preparation: "जमीन की तैयारी",
      imminent: "बुवाई से पहले (जल्द बुवाई)",
      sowing_day: "बुवाई का दिन",
      overdue: "बुवाई में देरी",
    },
    mr: {
      planning: "जमीन नियोजन",
      preparation: "जमीन तयारी",
      imminent: "पेरणीपूर्व (लवकर पेरणी)",
      sowing_day: "पेरणीचा दिवस",
      overdue: "पेरणी उशीर",
    },
  };

  const labels = phaseLabels[lang] || phaseLabels.en;
  const stagePrefix =
    lang === "hi"
      ? "बुवाई से पहले"
      : lang === "mr"
        ? "पेरणीपूर्व"
        : "Pre-sowing";
  const stageName = `${stagePrefix} — ${labels[phase] || labels.preparation}`;

  let description = `No standing crop. Preparing for ${crop} (${farmField?.variety || ""}). Expected sowing: ${expectedSowingISO}.`;
  if (lang === "hi") {
    description = `खाली खेत। ${crop} (${farmField?.variety || ""}) की बुवाई की तैयारी। अपेक्षित बुवाई: ${expectedSowingISO}।`;
  } else if (lang === "mr") {
    description = `रानटी जमीन. ${crop} (${farmField?.variety || ""}) पेरणीपूर्व तयारी. अपेक्षित पेरणी: ${expectedSowingISO}.`;
  }

  return {
    bbchStage: 0,
    stageName,
    description,
    cumulativeGDD: 0,
    gddSource: "not_applicable",
    farmStatus: "barren",
    daysUntilSowing: days,
    expectedSowingDate: expectedSowingISO,
    preSowingPhase: phase,
  };
}

export function buildBarrenLandCropHealth(farmField, sowingWindow, language = "en") {
  const crop = farmField?.cropName || "crop";
  let recommendation =
    `Barren field — no crop in ground. Follow pre-sowing checklist for ${crop}. ${sowingWindow.reason}`;

  if (language === "hi") {
    recommendation = `खाली खेत — फसल नहीं है। ${crop} की बुवाई से पहले की तैयारी करें। ${sowingWindow.reason}`;
  } else if (language === "mr") {
    recommendation = `रानटी जमीन — पिक नाही. ${crop} पेरणीपूर्व तयारी करा. ${sowingWindow.reason}`;
  }

  return {
    score: null,
    percentage: null,
    category: "Pre-sowing",
    recommendation,
  };
}

export function buildBarrenLandEvidence({
  farmField,
  weatherSummary,
  ndvi = null,
  water = null,
  language = "en",
}) {
  const expectedSowingISO = formatDateISO(farmField.sowingDate);
  const days = daysUntilSowing(expectedSowingISO);
  const phase = getPreSowingPhase(days);
  const cropKey = normalizeCropName(farmField?.cropName);
  const cropCategory = CROP_CATEGORY_MAP[cropKey] || "default";

  const soilMoistureRaw =
    weatherSummary?.current?.soilMoisture_15cm ??
    weatherSummary?.current?.soilMoisture_5cm ??
    null;
  const soilMoisturePercent = soilMoistureToPercent(soilMoistureRaw);
  const rainfall7d = sumRain(weatherSummary?.next7Days?.rainfall, 7);

  const lang = normalizeAdvisoryLanguage(language);
  const sowingWindow = assessSowingWindow(weatherSummary, days, lang);
  const landPreparation = buildLandPrepHint(phase, farmField, sowingWindow);

  const decisionHints = {
    landPreparation,
    sowingWindow,
    seedTreatment: buildSeedTreatmentHint(cropKey, phase),
    spray: buildSprayHint(phase, weatherSummary, lang),
    fertigation: buildBasalFertigationHint(farmField, phase, lang),
    irrigation: buildIrrigationHint(soilMoisturePercent, phase, rainfall7d, lang),
    monitoring: {
      hint: {
        message: t("barren_monitoring", lang),
        checks: "weeds, soil moisture, stones, drainage, equipment readiness",
        zone: "whole field",
      },
    },
  };

  return {
    language: lang,
    farmStatus: "barren",
    isBarrenLand: true,
    advisoryMode: "pre_sowing",
    cropType: farmField?.cropName,
    plannedVariety: farmField?.variety,
    expectedSowingDate: expectedSowingISO,
    daysUntilSowing: days,
    preSowingPhase: phase,
    cropCategory,
    typeOfFarming: farmField?.typeOfFarming,
    typeOfIrrigation: farmField?.typeOfIrrigation,
    acre: farmField?.acre,
    cropGrowthStage: "Pre-sowing (no standing crop)",
    soilMoisture: {
      currentPercent: soilMoisturePercent,
      status:
        soilMoisturePercent < 30
          ? "DRY"
          : soilMoisturePercent > 75
            ? "WET"
            : "ADEQUATE",
    },
    weatherForecast: {
      current: weatherSummary?.current,
      next7Days: weatherSummary?.next7Days,
      rainfallForecast3d: sumRain(weatherSummary?.next7Days?.rainfall, 3),
      rainfallForecast7d: rainfall7d,
    },
    sowingWindow,
    satellite: {
      ndviLatest: ndvi?.ndviLatest ?? null,
      note:
        ndvi?.ndviLatest != null && ndvi.ndviLatest < 0.25
          ? "Low greenness — bare or sparse vegetation as expected."
          : "Use satellite for weed/stubble patches if available.",
    },
    waterStress: water?.stressLevel || "unknown",
    decisionHints,
    isHarvestStage: false,
  };
}
