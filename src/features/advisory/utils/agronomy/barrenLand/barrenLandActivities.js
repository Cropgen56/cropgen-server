import { postProcessAdvisory } from "../../llm/postProcessAdvisory.js";
import { t, normalizeAdvisoryLanguage } from "../../i18n/advisoryLocale.js";

const ORDER = [
  "SPRAY",
  "FERTIGATION",
  "IRRIGATION",
  "WEATHER",
  "CROP_RISK",
  "MONITORING",
  "CARBON_TRACKING",
];

function langOf(evidence) {
  return normalizeAdvisoryLanguage(evidence?.language);
}

function sprayActivity(evidence) {
  const lang = langOf(evidence);
  const spray = evidence.decisionHints?.spray;
  if (!spray?.shouldSpray) {
    return {
      type: "SPRAY",
      title: t("title_spray_barren", lang),
      message: spray?.reason || t("barren_no_spray", lang),
      details: { phase: evidence.preSowingPhase },
    };
  }
  const hint = spray.hint || {};
  return {
    type: "SPRAY",
    title: t("title_spray_barren", lang),
    message: hint.message || spray.reason,
    details: {
      products: hint.products,
      applicationMethod: hint.method,
      timing: hint.timing,
    },
  };
}

function fertigationActivity(evidence) {
  const lang = langOf(evidence);
  const fert = evidence.decisionHints?.fertigation;
  if (!fert?.shouldFertigate) {
    return {
      type: "FERTIGATION",
      title: t("title_fert_barren", lang),
      message: fert?.reason || t("barren_fert_plan", lang, { crop: evidence.cropType }),
      details: { phase: evidence.preSowingPhase },
    };
  }
  const hint = fert.hint || {};
  return {
    type: "FERTIGATION",
    title: t("title_fert_barren", lang),
    message: fert.reason,
    details: {
      products: fert.products,
      applicationMethod: hint.method,
      timing: hint.time,
      reason: fert.reason,
    },
  };
}

function irrigationActivity(evidence) {
  const lang = langOf(evidence);
  const irr = evidence.decisionHints?.irrigation;
  if (!irr?.shouldIrrigate) {
    return {
      type: "IRRIGATION",
      title: t("title_irr_barren", lang),
      message:
        irr?.hint?.message || irr?.reason || t("barren_irr_pre_sowing_only", lang),
      details: { shouldIrrigate: false },
    };
  }
  return {
    type: "IRRIGATION",
    title: t("title_irr_barren", lang),
    message: irr.hint?.message || irr.reason,
    details: {
      applicationMethod: evidence.typeOfIrrigation,
      reason: irr.reason,
    },
  };
}

function sowingDaysNote(lang, days) {
  if (days > 0) return t("weather_days_note_future", lang, { days });
  if (days === 0) return t("weather_days_note_today", lang);
  if (days != null) return t("weather_days_note_overdue", lang, { days: Math.abs(days) });
  return "";
}

function weatherActivity(evidence) {
  const lang = langOf(evidence);
  const w = evidence.weatherForecast || {};
  const cur = w.current || {};
  const temp = cur.temp != null ? `${Math.round(cur.temp)}°C` : "—";
  const days = evidence.daysUntilSowing;
  const sw = evidence.sowingWindow || {};
  const rain3 = w.rainfallForecast3d ?? 0;
  const rain7 = w.rainfallForecast7d ?? 0;
  const daysNote = sowingDaysNote(lang, days);

  const message = t("weather_message", lang, {
    temp,
    rain3: Math.round(rain3),
    rain7: Math.round(rain7),
    daysNote,
    reason: sw.reason || "",
  }).trim();

  return {
    type: "WEATHER",
    title: t("title_weather_barren", lang),
    message,
    details: {
      temperature: temp,
      rainfall3dMm: rain3,
      rainfall7dMm: rain7,
      sowingSuitable: sw.suitable,
      advisory: sw.reason,
      daysUntilSowing: days,
    },
  };
}

function cropRiskActivity(evidence) {
  const lang = langOf(evidence);
  const sw = evidence.sowingWindow || {};
  const days = evidence.daysUntilSowing;
  let riskLevel = sw.suitable === false ? "moderate" : "low";

  const causes = [];
  if (days != null && days < 0) {
    riskLevel = "high";
    causes.push(t("crop_risk_cause_delayed", lang));
  }
  if ((evidence.weatherForecast?.rainfallForecast3d ?? 0) >= 35) {
    riskLevel = "high";
    causes.push(t("crop_risk_cause_heavy_rain", lang));
  }
  if (evidence.soilMoisture?.status === "WET") {
    causes.push(t("crop_risk_cause_wet_soil", lang));
  }
  if (evidence.soilMoisture?.status === "DRY" && days != null && days <= 7) {
    causes.push(t("crop_risk_cause_dry_bed", lang));
  }

  const cause = causes.length
    ? causes.join(", ")
    : t("crop_risk_cause_routine", lang);
  const action =
    riskLevel === "high"
      ? t("crop_risk_action_high", lang)
      : t("crop_risk_action_low", lang);
  const levelKey =
    riskLevel === "high"
      ? "crop_risk_level_high"
      : riskLevel === "moderate"
        ? "crop_risk_level_moderate"
        : "crop_risk_level_low";

  return {
    type: "CROP_RISK",
    title: t("title_risk_barren", lang),
    message: t("crop_risk_message", lang, {
      level: t(levelKey, lang),
      cause,
      action,
    }),
    details: { riskLevel, cause, recommendedAction: action },
  };
}

function monitoringActivity(evidence) {
  const lang = langOf(evidence);
  const mon = evidence.decisionHints?.monitoring;
  return {
    type: "MONITORING",
    title: t("title_monitor_barren", lang),
    message: mon?.hint?.message || t("barren_monitoring", lang),
    details: {
      focusAreas: mon?.hint?.zone || "whole field",
      whatToCheck: mon?.hint?.checks,
      landPrepTasks: evidence.decisionHints?.landPreparation?.tasks,
      frequency: evidence.preSowingPhase === "imminent" ? "daily" : "every 3–5 days",
    },
  };
}

function carbonActivity(evidence) {
  const lang = langOf(evidence);
  const farming = evidence.typeOfFarming || "Integrated";
  const note =
    farming === "Organic" || farming === "Integrated"
      ? t("carbon_note_organic", lang)
      : t("carbon_note_conventional", lang);

  return {
    type: "CARBON_TRACKING",
    title: t("title_carbon_barren", lang),
    message: `${t("carbon_prefix_no_crop", lang)}${note}`,
    details: {
      emissionKgCO2: 0,
      capturedKgCO2: 0,
      netBalanceKgCO2: 0,
      note,
      phase: "pre_sowing",
    },
  };
}

export function buildBarrenLandActivities(evidence) {
  const builders = {
    SPRAY: sprayActivity,
    FERTIGATION: fertigationActivity,
    IRRIGATION: irrigationActivity,
    WEATHER: weatherActivity,
    CROP_RISK: cropRiskActivity,
    MONITORING: monitoringActivity,
    CARBON_TRACKING: carbonActivity,
  };

  const activitiesToDo = ORDER.map((type) => builders[type](evidence));
  return postProcessAdvisory({ activitiesToDo }, evidence);
}
