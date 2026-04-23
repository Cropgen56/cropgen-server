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
      quantity: req.waterRequirement_mm ? `${req.waterRequirement_mm} mm` : "—",
      method: shouldIrrigate
        ? isOpen
          ? req.durationHours != null
            ? `~${req.durationHours} hrs`
            : "Open/Flood irrigation"
          : req.durationMinutes != null
            ? `~${req.durationMinutes} min`
            : "Drip/Sprinkler irrigation"
        : "No irrigation today",
      time: "Morning (6–10 AM)",
      frequency: req.frequencyDays ? `Every ${req.frequencyDays} days` : "—",
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
      activityMap.set(type, { ...act, message: truncate(act.message) });
    }
  });

  return { activitiesToDo: REQUIRED_TYPES.map((type) => activityMap.get(type)) };
}
