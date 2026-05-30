import { postProcessAdvisory } from "../llm/postProcessAdvisory.js";
import { t, normalizeAdvisoryLanguage } from "../i18n/advisoryLocale.js";

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

function weatherActivity(evidence) {
  const lang = langOf(evidence);
  const w = evidence.weatherForecast || {};
  const cur = w.current || {};
  const temp = cur.temp != null ? `${Math.round(cur.temp)}°C` : "—";
  const humidity =
    cur.humidity != null ? `${Math.round(cur.humidity)}%` : "—";
  const rain3 = w.rainfallForecast3d ?? 0;
  const rain7 = w.rainfallForecast7d ?? 0;
  const rainProb =
    w.rainProbabilityToday === "likely"
      ? t("detail_rain_prob_likely", lang)
      : t("detail_rain_prob_low", lang);

  let tailKey = "crop_weather_clear";
  if (rain3 >= 25) {
    tailKey = "crop_weather_heavy_rain";
  } else if (rain3 >= 8) {
    tailKey = "crop_weather_light_rain";
  } else if (rain7 < 5 && evidence.irrigationRequirement?.needsIrrigation) {
    tailKey = "crop_weather_dry_week";
  }

  const advisory = (
    t("crop_weather_current", lang, { temp, humidity }) + t(tailKey, lang, { rain3: Math.round(rain3) })
  ).trim();

  return {
    type: "WEATHER",
    title: t("title_weather_crop", lang),
    message: advisory,
    details: {
      temperature: temp,
      humidity,
      rainfallProbability: rainProb,
      rainfall3dMm: rain3,
      rainfall7dMm: rain7,
      advisory,
    },
  };
}

function localizedSprayReason(spray, lang) {
  if (!spray) return t("no_spray", lang);
  if (spray.shouldSpray) {
    return spray.hint?.message && !/^[A-Za-z]/.test(spray.hint.message.slice(0, 8))
      ? spray.hint.message
      : t("decision_stress_spray", lang);
  }
  const reason = String(spray.reason || "");
  if (reason.includes("Organic")) return t("decision_organic_no_spray", lang);
  if (reason.includes("Wind") || reason.includes("rain")) {
    return t("decision_wind_rain_no_spray", lang);
  }
  if (reason.includes("stable") || reason.includes("No spray")) {
    return t("decision_stable_no_spray", lang);
  }
  return t("no_spray", lang);
}

function localizedFertReason(fert, lang) {
  if (!fert) return t("no_fertigation", lang);
  if (fert.shouldFertigate) {
    const h = fert.hint || {};
    if (h.fertilizer && h.quantity) {
      return t("apply_fertigation", lang, {
        fertilizer: h.fertilizer,
        quantity: h.quantity,
      });
    }
    const reason = String(fert.reason || "");
    const stageMatch = reason.match(/Apply (.+?) nutrients/i);
    if (stageMatch) {
      return t("decision_apply_stage_nutrients", lang, { stage: stageMatch[1] });
    }
    if (reason.includes("Organic")) return t("decision_organic_fert", lang);
    return t("decision_apply_stage_nutrients", lang, { stage: "" });
  }
  const reason = String(fert.reason || "");
  if (reason.includes("NPK") || reason.includes("baseline")) {
    return t("decision_npk_missing", lang);
  }
  if (reason.includes("BBCH") || reason.includes("window")) {
    return t("decision_no_fert_window", lang);
  }
  if (reason.includes("balanced")) return t("decision_nutrients_balanced", lang);
  return t("no_fertigation", lang);
}

function sprayActivity(evidence) {
  const lang = langOf(evidence);
  const spray = evidence.decisionHints?.spray;
  if (!spray?.shouldSpray) {
    return {
      type: "SPRAY",
      title: t("title_spray", lang),
      message: localizedSprayReason(spray, lang),
      details: { recommendedAction: t("detail_recommended_none", lang) },
    };
  }
  const hint = spray.hint || {};
  const products = (hint.products || [])
    .map((p) => `${p.name}${p.dose ? ` (${p.dose})` : ""}`)
    .join("; ");
  const message =
    products
      ? t("crop_spray_products", lang, {
          reason: t("decision_stress_spray", lang),
          products,
        })
      : t("decision_spray_choose", lang);

  return {
    type: "SPRAY",
    title: t("title_spray_advisory", lang),
    message,
    details: {
      products: hint.products,
      applicationMethod: hint.method || t("detail_foliar_spray", lang),
      timing: hint.timing || t("detail_spray_timing_default", lang),
      notes: hint.notes,
    },
  };
}

function fertigationActivity(evidence) {
  const lang = langOf(evidence);
  const fert = evidence.decisionHints?.fertigation;
  if (!fert?.shouldFertigate) {
    return {
      type: "FERTIGATION",
      title: t("title_fertigation", lang),
      message: localizedFertReason(fert, lang),
      details: {},
    };
  }
  const message = localizedFertReason(fert, lang);
  const hint = fert.hint || {};

  return {
    type: "FERTIGATION",
    title: t("title_fertigation", lang),
    message,
    details: {
      products: fert.products,
      applicationMethod: hint.method,
      timing: hint.time,
      reason: fert.reason,
      nutrientDeficit: hint.nutrientDeficit,
    },
  };
}

function irrigationActivity(evidence) {
  const lang = langOf(evidence);
  const irr = evidence.decisionHints?.irrigation;
  const req = evidence.irrigationRequirement || {};
  if (!irr?.shouldIrrigate && !req.needsIrrigation) {
    return {
      type: "IRRIGATION",
      title: t("title_irrigation", lang),
      message: t("no_irrigation", lang),
      details: { shouldIrrigate: false },
    };
  }
  const hint = irr?.hint || {};
  const hours = req.amountHours;
  const minutes = req.amountMinutes;
  const message = hours
    ? t("decision_irrigation_open", lang, { hours })
    : t("decision_irrigation_drip", lang, { minutes: minutes || hint.quantity || 0 });

  return {
    type: "IRRIGATION",
    title: t("title_irrigation", lang),
    message,
    details: {
      applicationMethod: evidence.irrigationType || t("detail_app_open_irrigation", lang),
      timing: t("detail_irr_timing_morning", lang),
      duration: hours
        ? t("detail_duration_hours", lang, { hours })
        : t("detail_duration_minutes", lang, { minutes: minutes || 0 }),
      waterQuantity: hint.quantity,
      reason: req.reason,
      frequency: req.frequency,
    },
  };
}

function cropRiskActivity(evidence) {
  const lang = langOf(evidence);
  const stress = evidence.stressZones || {};
  const health = evidence.cropHealth || {};
  const pressure = stress.diseasePressure || "low";
  const waterPct = stress.percentageWaterStressed ?? 0;
  const nPct = stress.percentageNitrogenDeficient ?? 0;

  let riskLevel = "low";
  const causes = [];
  if (waterPct >= 40) {
    riskLevel = "moderate";
    causes.push(t("crop_risk_water_stress", lang));
  }
  if (nPct >= 35) {
    riskLevel = "moderate";
    causes.push(t("crop_risk_n_deficiency", lang));
  }
  if (pressure === "high") {
    riskLevel = "high";
    causes.push(t("crop_risk_disease_pressure", lang));
  }
  if (health.category === "Poor" || health.category === "Critical") {
    riskLevel = "high";
    causes.push(
      t("crop_risk_health", lang, { category: health.category }),
    );
  }

  const cause = causes.length
    ? causes.join(", ")
    : t("crop_risk_no_stress", lang);
  const action =
    riskLevel === "high"
      ? t("crop_risk_action_high", lang)
      : riskLevel === "moderate"
        ? t("crop_risk_action_moderate", lang)
        : t("crop_risk_action_low", lang);
  const levelKey =
    riskLevel === "high"
      ? "crop_risk_level_high"
      : riskLevel === "moderate"
        ? "crop_risk_level_moderate"
        : "crop_risk_level_low";

  return {
    type: "CROP_RISK",
    title: t("title_crop_risk", lang),
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
  const hint = mon?.hint || {};
  const checks = hint.checks || t("detail_monitor_checks", lang);
  return {
    type: "MONITORING",
    title: t("title_monitoring_crop", lang),
    message: t("crop_monitor_default", lang, { checks }),
    details: {
      focusAreas: hint.zone || t("detail_focus_whole_field", lang),
      whatToCheck: checks,
      frequency: t("detail_monitor_frequency", lang),
    },
  };
}

function carbonActivity(evidence) {
  const lang = langOf(evidence);
  const c = evidence.carbonData;
  if (!c) {
    return {
      type: "CARBON_TRACKING",
      title: t("title_carbon_crop", lang),
      message: t("crop_carbon_unavailable", lang),
      details: {},
    };
  }
  const net = c.netBalanceKgCO2 ?? 0;
  const note =
    net < 0
      ? t("crop_carbon_positive", lang)
      : t("crop_carbon_negative", lang);

  return {
    type: "CARBON_TRACKING",
    title: t("title_carbon_crop", lang),
    message: t("crop_carbon_message", lang, {
      emission: Math.round(c.emissionKgCO2 || 0),
      capture: Math.round(c.capturedKgCO2 || 0),
      net: Math.round(net),
      note,
    }),
    details: {
      emissionKgCO2: c.emissionKgCO2,
      capturedKgCO2: c.capturedKgCO2,
      netBalanceKgCO2: net,
      note,
    },
  };
}

/**
 * Agronomist rule-based activities when LLM is unavailable or for language merge fallback.
 */
export function buildActivitiesFromDecisionHints(evidence) {
  const lang = langOf(evidence);
  const builders = {
    SPRAY: sprayActivity,
    FERTIGATION: fertigationActivity,
    IRRIGATION: irrigationActivity,
    WEATHER: weatherActivity,
    CROP_RISK: cropRiskActivity,
    MONITORING: monitoringActivity,
    CARBON_TRACKING: carbonActivity,
  };

  if (evidence.isHarvestStage && evidence.decisionHints?.harvestPlanning) {
    return postProcessAdvisory(
      {
        activitiesToDo: [
          {
            type: "SPRAY",
            title: t("title_harvest_stage", lang),
            message: t("harvest_no_spray", lang),
            details: {},
          },
          {
            type: "FERTIGATION",
            title: t("title_harvest_stage", lang),
            message: t("harvest_no_fert", lang),
            details: {},
          },
          {
            type: "IRRIGATION",
            title: t("title_harvest_stage", lang),
            message: t("harvest_reduce_irr", lang),
            details: {},
          },
          weatherActivity(evidence),
          cropRiskActivity(evidence),
          monitoringActivity(evidence),
          carbonActivity(evidence),
        ],
      },
      evidence,
    );
  }

  const activitiesToDo = ORDER.map((type) => builders[type](evidence));
  return postProcessAdvisory({ activitiesToDo }, evidence);
}
