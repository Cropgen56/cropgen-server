import { normalizeTypeOfFarming } from "../shared/farmingTypeNormalize.js";

const REQUIRED_TYPES = [
  "SPRAY",
  "FERTIGATION",
  "IRRIGATION",
  "WEATHER",
  "CROP_RISK",
  "MONITORING",
  "CARBON_TRACKING",
];

const WHATSAPP_MAX = 220;

function truncate(text, max = WHATSAPP_MAX) {
  if (!text || typeof text !== "string") return text || "";
  const t = text.trim();
  return t.length <= max ? t : `${t.slice(0, max - 3)}...`;
}

function defaultActivity(type) {
  return {
    type,
    title: type,
    message: "No advisory update.",
    details: {},
  };
}

function buildIrrigationActivity(evidence, language) {
  const req = evidence?.irrigationRequirement ?? {};
  const shouldIrrigate = req.shouldIrrigate ?? req.needsIrrigation ?? false;
  const irrigationType = (evidence?.irrigationType || "").toLowerCase();
  const isOpen = irrigationType.includes("open") || irrigationType.includes("flood");

  let message;
  if (!shouldIrrigate) {
    message = req.reason || "No irrigation needed today.";
  } else if (isOpen) {
    const hrs = req.amountHours || req.durationHours || 1;
    message =
      language === "mr"
        ? `खुल्या नळीने सुमारे ${hrs} तास सिंचन करा.`
        : language === "hi"
          ? `Khuli nali se lagbhag ${hrs} ghante sinchai karein.`
          : `Give open irrigation for about ${hrs} hours today.`;
  } else {
    const mins = req.amountMinutes || req.durationMinutes || 45;
    message =
      language === "mr"
        ? `ड्रिप/स्प्रिंकलर अंदाजे ${mins} मिनिटे चालू ठेवा.`
        : language === "hi"
          ? `Drip/sprinkler ${mins} minute chalu rakhein.`
          : `Run drip/sprinkler for ~${mins} min today.`;
  }

  return {
    type: "IRRIGATION",
    title: language === "mr" ? "सिंचन वेळापत्रक" : language === "hi" ? "सिंचाई अनुसूची" : "Irrigation Schedule",
    message: truncate(message),
    details: {
      applicationMethod: shouldIrrigate
        ? isOpen
          ? req.durationHours != null
            ? "Flood / Open irrigation"
            : "Open/Flood irrigation"
          : req.durationMinutes != null
            ? "Drip / Sprinkler"
            : "Drip/Sprinkler irrigation"
        : "No irrigation required",
      timing: "Morning (6–10 AM)",
      duration: shouldIrrigate
        ? isOpen
          ? `${req.durationHours ?? req.amountHours ?? 0} hours`
          : `${req.durationMinutes ?? req.amountMinutes ?? 0} minutes`
        : "Not required",
      waterQuantity: req.waterRequirement_mm ? `${req.waterRequirement_mm} mm` : "Not required",
      reason: req.reason || "Soil moisture and weather based recommendation.",
      frequency: req.frequencyDays ? `Every ${req.frequencyDays} days` : "",
      confidence: req.dataConfidence || "high",
    },
  };
}

export function postProcessAdvisory(llmOutput, evidence, language, buildFertigationFn) {
  const activities = llmOutput?.activitiesToDo ?? [];
  const activityMap = new Map();
  activities.forEach((a) => activityMap.set(a.type, a));

  activityMap.set("IRRIGATION", buildIrrigationActivity(evidence, language));
  if (buildFertigationFn) {
    activityMap.set("FERTIGATION", buildFertigationFn(language, evidence));
  }

  if (normalizeTypeOfFarming(evidence?.typeOfFarming) === "Organic" && activityMap.has("SPRAY")) {
    const spray = activityMap.get("SPRAY");
    activityMap.set("SPRAY", {
      ...spray,
      message: truncate("Organic farm: avoid synthetic spray, use approved bio solutions only."),
    });
  }

  REQUIRED_TYPES.forEach((type) => {
    if (!activityMap.has(type)) {
      activityMap.set(type, defaultActivity(type));
    } else {
      const act = activityMap.get(type);
      activityMap.set(type, {
        ...act,
        title: typeof act.title === "string" ? act.title : type,
        message: truncate(act.message),
        details: act.details && typeof act.details === "object" ? act.details : {},
      });
    }
  });

  return { activitiesToDo: REQUIRED_TYPES.map((type) => activityMap.get(type)) };
}
