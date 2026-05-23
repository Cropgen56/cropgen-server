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

function weatherActivity(evidence) {
  const lang = langOf(evidence);
  const w = evidence.weatherForecast || {};
  const cur = w.current || {};
  const temp = cur.temp != null ? `${Math.round(cur.temp)}°C` : "—";
  const days = evidence.daysUntilSowing;
  const sw = evidence.sowingWindow || {};
  const rain3 = w.rainfallForecast3d ?? 0;
  const rain7 = w.rainfallForecast7d ?? 0;

  let daysNote = "";
  if (lang === "hi") {
    if (days > 0) daysNote = ` अपेक्षित बुवाई ${days} दिन में।`;
    else if (days === 0) daysNote = " अपेक्षित बुवाई आज है।";
    else if (days != null) daysNote = ` बुवाई तिथि ${Math.abs(days)} दिन पहले बीत गई — तारीख अपडेट करें या जल्द बोएं।`;
  } else if (lang === "mr") {
    if (days > 0) daysNote = ` अपेक्षित पेरणी ${days} दिवसात.`;
    else if (days === 0) daysNote = " अपेक्षित पेरणी आज आहे.";
    else if (days != null) daysNote = ` पेरणी तारीख ${Math.abs(days)} दिवसांपूर्वी — तारीख अद्यतनित करा.`;
  } else {
    if (days > 0) daysNote = ` Expected sowing in ${days} day(s).`;
    else if (days === 0) daysNote = " Expected sowing is today.";
    else if (days != null) daysNote = ` Sowing date was ${Math.abs(days)} day(s) ago — update or sow soon.`;
  }

  const message =
    lang === "hi"
      ? `मौसम: ${temp}. अगले 3 दिन ~${Math.round(rain3)} mm, 7 दिन ~${Math.round(rain7)} mm बारिश.${daysNote} ${sw.reason || ""}`.trim()
      : lang === "mr"
        ? `हवामान: ${temp}. पुढील 3 दिवस ~${Math.round(rain3)} mm, 7 दिवस ~${Math.round(rain7)} mm पाऊस.${daysNote} ${sw.reason || ""}`.trim()
        : `Weather: ${temp}. Next 3d rain ~${Math.round(rain3)} mm, 7d ~${Math.round(rain7)} mm.${daysNote} ${sw.reason || ""}`.trim();

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

  if (lang === "hi") {
    const causes = [];
    if (days != null && days < 0) {
      riskLevel = "high";
      causes.push("योजना से बुवाई में देरी");
    }
    if ((evidence.weatherForecast?.rainfallForecast3d ?? 0) >= 35) {
      riskLevel = "high";
      causes.push("बुवाई से पहले भारी बारिश");
    }
    if (evidence.soilMoisture?.status === "WET") causes.push("बुवाई के लिए अत्यधिक गीली मिट्टी");
    if (evidence.soilMoisture?.status === "DRY" && days != null && days <= 7) {
      causes.push("सूखा बीज बिस्तर");
    }
    const cause = causes.length ? causes.join(", ") : "सामान्य पूर्व-बुवाई जोखिम";
    const action =
      riskLevel === "high"
        ? "बुवाई तिथि या किस्म की खिड़की समायोजित करें; जलभराव वाली मिट्टी में न बोएं।"
        : "जमीन तैयारी सूची का पालन करें और बुवाई सप्ताह के पास रोज पूर्वानुमान देखें।";
    return {
      type: "CROP_RISK",
      title: t("title_risk_barren", lang),
      message: `${riskLevel === "high" ? "उच्च" : riskLevel === "moderate" ? "मध्यम" : "कम"} जोखिम: ${cause}. ${action}`,
      details: { riskLevel, cause, recommendedAction: action },
    };
  }

  if (lang === "mr") {
    const causes = [];
    if (days != null && days < 0) {
      riskLevel = "high";
      causes.push("योजनेपेक्षा पेरणी उशीरा");
    }
    if ((evidence.weatherForecast?.rainfallForecast3d ?? 0) >= 35) {
      riskLevel = "high";
      causes.push("पेरणीपूर्व जोरदार पाऊस");
    }
    if (evidence.soilMoisture?.status === "WET") causes.push("पेरणीसाठी खूप ओली माती");
    const cause = causes.length ? causes.join(", ") : "सामान्य पेरणीपूर्व धोका";
    const action =
      riskLevel === "high"
        ? "पेरणी तारीख किंवा जात खिडकी समायोजित करा; पाणथळ असलेल्या जमिनीत पेरू नका."
        : "जमीन तयारी यादी पाळा आणि पेरणी आठवड्याजवळ हवामान पहा.";
    return {
      type: "CROP_RISK",
      title: t("title_risk_barren", lang),
      message: `${riskLevel} धोका: ${cause}. ${action}`,
      details: { riskLevel, cause, recommendedAction: action },
    };
  }

  const causes = [];
  if (days != null && days < 0) {
    riskLevel = "high";
    causes.push("delayed sowing vs plan");
  }
  if ((evidence.weatherForecast?.rainfallForecast3d ?? 0) >= 35) {
    riskLevel = "high";
    causes.push("heavy rain before sowing");
  }
  const cause = causes.length ? causes.join(", ") : "routine pre-sowing risks";
  const action =
    riskLevel === "high"
      ? "Adjust sowing date or variety window; do not sow into waterlogged soil."
      : "Follow land prep checklist and monitor forecast daily near sowing week.";
  return {
    type: "CROP_RISK",
    title: t("title_risk_barren", lang),
    message: `${riskLevel.charAt(0).toUpperCase() + riskLevel.slice(1)} risk: ${cause}. ${action}`,
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
  let note;
  if (lang === "hi") {
    note =
      farming === "Organic" || farming === "Integrated"
        ? "बुवाई से पहले सड़ा हुआ FYM/कम्पोस्ट मिलाएं — जैविक पदार्थ और कार्बन संचय बढ़ेगा।"
        : "पहली फसल चक्र से अवशेष संरक्षण और संतुलित खाद की योजना बनाएं।";
  } else if (lang === "mr") {
    note =
      farming === "Organic" || farming === "Integrated"
        ? "पेरणीपूर्व सडलेले FYM/कंपोस्ट मिसळा — सेंद्रिय पदार्थ आणि कार्बन वाढेल."
        : "पहिल्या पिकाच्या चक्रापासून अवशेष आणि खताची योजना करा.";
  } else {
    note =
      farming === "Organic" || farming === "Integrated"
        ? "Before sowing: add compost/FYM to improve organic matter and long-term carbon capture."
        : "Plan residue retention and efficient fertilizer use from the first crop cycle.";
  }
  const prefix =
    lang === "hi"
      ? "अभी फसल कार्बन अवशोषण नहीं। "
      : lang === "mr"
        ? "अद्याप पिक कार्बन शोषण नाही. "
        : "No crop carbon uptake yet. ";
  return {
    type: "CARBON_TRACKING",
    title: t("title_carbon_barren", lang),
    message: `${prefix}${note}`,
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
