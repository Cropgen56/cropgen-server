import { postProcessAdvisory } from "../llm/postProcessAdvisory.js";

const ORDER = [
  "SPRAY",
  "FERTIGATION",
  "IRRIGATION",
  "WEATHER",
  "CROP_RISK",
  "MONITORING",
  "CARBON_TRACKING",
];

function weatherActivity(evidence) {
  const w = evidence.weatherForecast || {};
  const cur = w.current || {};
  const temp = cur.temp != null ? `${Math.round(cur.temp)}°C` : "—";
  const humidity =
    cur.humidity != null ? `${Math.round(cur.humidity)}%` : "—";
  const rain3 = w.rainfallForecast3d ?? 0;
  const rain7 = w.rainfallForecast7d ?? 0;
  const rainProb = w.rainProbabilityToday === "likely" ? "likely" : "low";

  let advisory = `Current ${temp}, humidity ${humidity}.`;
  if (rain3 >= 25) {
    advisory += ` Heavy rain expected in next 3 days (~${Math.round(rain3)} mm) — delay spray and adjust irrigation.`;
  } else if (rain3 >= 8) {
    advisory += ` Light to moderate rain in next 3 days (~${Math.round(rain3)} mm).`;
  } else if (rain7 < 5 && (evidence.irrigationRequirement?.needsIrrigation)) {
    advisory += " Dry week ahead — plan irrigation per schedule.";
  } else {
    advisory += " No major rain risk in the next few days.";
  }

  return {
    type: "WEATHER",
    title: "Weather outlook",
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

function sprayActivity(evidence) {
  const spray = evidence.decisionHints?.spray;
  if (!spray?.shouldSpray) {
    return {
      type: "SPRAY",
      title: "Spray",
      message: spray?.reason || "No spray required today.",
      details: { recommendedAction: "none" },
    };
  }
  const hint = spray.hint || {};
  const products = (hint.products || [])
    .map((p) => `${p.name}${p.dose ? ` (${p.dose})` : ""}`)
    .join("; ");
  return {
    type: "SPRAY",
    title: "Spray advisory",
    message:
      hint.message ||
      `${spray.reason}${products ? `. Products: ${products}` : ""}`,
    details: {
      products: hint.products,
      applicationMethod: hint.method || "foliar spray",
      timing: hint.timing || "early morning or late evening",
      notes: hint.notes,
    },
  };
}

function fertigationActivity(evidence) {
  const fert = evidence.decisionHints?.fertigation;
  if (!fert?.shouldFertigate) {
    return {
      type: "FERTIGATION",
      title: "Fertigation",
      message: fert?.reason || "No fertigation needed today.",
      details: {},
    };
  }
  const hint = fert.hint || {};
  return {
    type: "FERTIGATION",
    title: "Fertigation",
    message:
      hint.fertilizer && hint.quantity
        ? `Apply ${hint.fertilizer}: ${hint.quantity}. ${hint.time || ""}`.trim()
        : fert.reason,
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
  const irr = evidence.decisionHints?.irrigation;
  const req = evidence.irrigationRequirement || {};
  if (!irr?.shouldIrrigate && !req.needsIrrigation) {
    return {
      type: "IRRIGATION",
      title: "Irrigation",
      message:
        irr?.hint?.message ||
        req.reason ||
        "Soil moisture adequate. No irrigation today.",
      details: { shouldIrrigate: false },
    };
  }
  const hint = irr?.hint || {};
  return {
    type: "IRRIGATION",
    title: "Irrigation",
    message:
      hint.message ||
      req.reason ||
      `Irrigate: ${req.amountHours ? `${req.amountHours} h` : `${req.amountMinutes || 0} min`}.`,
    details: {
      applicationMethod: evidence.irrigationType,
      timing: "early morning (6–10 AM) preferred",
      duration: req.amountHours
        ? `${req.amountHours} hours`
        : `${req.amountMinutes || 0} minutes`,
      waterQuantity: hint.quantity,
      reason: req.reason,
      frequency: req.frequency,
    },
  };
}

function cropRiskActivity(evidence) {
  const stress = evidence.stressZones || {};
  const health = evidence.cropHealth || {};
  const pressure = stress.diseasePressure || "low";
  const waterPct = stress.percentageWaterStressed ?? 0;
  const nPct = stress.percentageNitrogenDeficient ?? 0;

  let riskLevel = "low";
  const causes = [];
  if (waterPct >= 40) {
    riskLevel = "moderate";
    causes.push("water stress");
  }
  if (nPct >= 35) {
    riskLevel = "moderate";
    causes.push("nitrogen deficiency signal");
  }
  if (pressure === "high") {
    riskLevel = "high";
    causes.push("elevated pest/disease pressure");
  }
  if (health.category === "Poor" || health.category === "Critical") {
    riskLevel = "high";
    causes.push(`crop health ${health.category}`);
  }

  const cause = causes.length ? causes.join(", ") : "no major stress signals";
  const action =
    riskLevel === "high"
      ? "Scout field within 24 hours; address irrigation and nutrition first."
      : riskLevel === "moderate"
        ? "Monitor stressed zones; confirm irrigation and leaf color."
        : "Routine monitoring is sufficient.";

  return {
    type: "CROP_RISK",
    title: "Crop risk",
    message: `${riskLevel.charAt(0).toUpperCase() + riskLevel.slice(1)} risk: ${cause}. ${action}`,
    details: { riskLevel, cause, recommendedAction: action },
  };
}

function monitoringActivity(evidence) {
  const mon = evidence.decisionHints?.monitoring;
  const hint = mon?.hint || {};
  const checks = hint.checks || "leaves, stem base, soil moisture, pests";
  return {
    type: "MONITORING",
    title: "Field monitoring",
    message:
      hint.message ||
      `Check ${checks}. Repeat every 3–4 days or after rain.`,
    details: {
      focusAreas: hint.zone || "whole field",
      whatToCheck: checks,
      frequency: "every 3–4 days",
    },
  };
}

function carbonActivity(evidence) {
  const c = evidence.carbonData;
  if (!c) {
    return {
      type: "CARBON_TRACKING",
      title: "Carbon",
      message: "Carbon data not available for this cycle.",
      details: {},
    };
  }
  const net = c.netBalanceKgCO2 ?? 0;
  const note =
    net < 0
      ? "Net carbon positive for the farm — maintain residue and organic matter."
      : "Higher emissions than capture — consider efficient irrigation and balanced fertilizer.";
  return {
    type: "CARBON_TRACKING",
    title: "Carbon update",
    message: `Estimated emissions ${Math.round(c.emissionKgCO2 || 0)} kg CO₂, capture ${Math.round(c.capturedKgCO2 || 0)} kg CO₂. Net ${Math.round(net)} kg CO₂. ${note}`,
    details: {
      emissionKgCO2: c.emissionKgCO2,
      capturedKgCO2: c.capturedKgCO2,
      netBalanceKgCO2: net,
      note,
    },
  };
}

/**
 * Agronomist rule-based activities when LLM is unavailable or returns empty content.
 */
export function buildActivitiesFromDecisionHints(evidence) {
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
    const hp = evidence.decisionHints.harvestPlanning;
    return postProcessAdvisory(
      {
        activitiesToDo: [
          {
            type: "SPRAY",
            title: "Harvest stage",
            message: "No spray at harvest.",
            details: {},
          },
          {
            type: "FERTIGATION",
            title: "Harvest stage",
            message: "No fertilizer at harvest.",
            details: {},
          },
          {
            type: "IRRIGATION",
            title: "Harvest stage",
            message: "Reduce irrigation before harvest unless soil is very dry.",
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
