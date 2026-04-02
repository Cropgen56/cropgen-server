/**
 * Post-processing layer — deterministic validation and overrides on LLM output.
 * Rules that MUST hold regardless of what the model says:
 *   1. IRRIGATION → rebuilt from evidence.irrigationRequirement (ET₀-based)
 *   2. FERTIGATION → rebuilt from decisionHints (product + doses aligned with farm type)
 *   3. SPRAY skip when shouldSpray===false, or organic farms
 *   4. All 7 required activity types present
 *   5. Messages truncated to 155 chars for WhatsApp
 */

import { normalizeTypeOfFarming } from "./farmingTypeNormalize.js";

const REQUIRED_TYPES = [
  "SPRAY",
  "FERTIGATION",
  "IRRIGATION",
  "WEATHER",
  "CROP_RISK",
  "MONITORING",
  "CARBON_TRACKING",
];

const WHATSAPP_MAX = 155;

function truncate(text, max = WHATSAPP_MAX) {
  if (!text || typeof text !== "string") return text || "";
  const t = text.trim();
  return t.length <= max ? t : t.slice(0, max - 3) + "...";
}

/** Build IRRIGATION activity from pre-calculated evidence */
function buildIrrigationActivity(evidence, language) {
  const req = evidence?.irrigationRequirement ?? {};
  const shouldIrrigate = req.shouldIrrigate ?? req.needsIrrigation ?? false;
  const irrigationType = (evidence?.irrigationType || "").toLowerCase();
  const isOpen = irrigationType.includes("open") || irrigationType.includes("flood");

  let message;
  if (!shouldIrrigate) {
    message = req.reason || (
      language === "mr" ? "आज सिंचनाची गरज नाही, मातीतील ओलावा पुरेसा आहे."
      : language === "hi" ? "Aaj sinchai ki jarurat nahi, mitti ki nami kaafi hai."
      : "No irrigation needed today, soil moisture is adequate."
    );
  } else if (isOpen) {
    const hrs = req.amountHours || req.durationHours || 1;
    message = language === "mr"
      ? `खुल्या नळीने सुमारे ${hrs} तास सिंचन करा. (${req.waterRequirement_mm ?? ""}mm)`
      : language === "hi"
      ? `Khuli nali se lagbhag ${hrs} ghante sinchai karein. (${req.waterRequirement_mm ?? ""}mm)`
      : `Give open irrigation for about ${hrs} hours today. (~${req.waterRequirement_mm ?? "?"}mm)`;
  } else {
    const mins = req.amountMinutes || req.durationMinutes || 45;
    const mm   = req.waterRequirement_mm;
    const freq = req.frequencyDays;
    message = language === "mr"
      ? `ड्रिप/स्प्रिंकलर अंदाजे ${mins} मिनिटे चालू ठेवा.${mm ? ` (~${mm}mm)` : ""}`
      : language === "hi"
      ? `Drip/sprinkler ${mins} minute chalu rakhein.${mm ? ` (~${mm}mm)` : ""}`
      : `Run drip/sprinkler for ~${mins} min${freq ? ` every ${freq} days` : ""}.${mm ? ` (~${mm} mm)` : ""}`;
  }

  return {
    type: "IRRIGATION",
    title: language === "mr" ? "सिंचन वेळापत्रक"
         : language === "hi" ? "सिंचाई अनुसूची"
         : "Irrigation Schedule",
    message: truncate(message),
    details: {
      quantity: req.waterRequirement_mm ? `${req.waterRequirement_mm} mm` : "—",
      method: req.durationHours != null
        ? (isOpen ? `Open irrigation ~${req.durationHours}hrs` : `Drip/sprinkler ~${req.durationMinutes || Math.round(req.durationHours * 60)} min`)
        : "—",
      time: "Morning (6–10 AM)",
      discharge: req.discharge_lmin ? `${req.discharge_lmin} L/min` : null,
      criticality: req.criticality || null,
      frequency: req.frequencyDays ? `Every ${req.frequencyDays} days` : null,
      soilMoistureStatus: req.soilMoistureLevel || req.criticality || null,
    },
  };
}

/** Build a no-spray message */
function buildNoSprayMessage(language, reason) {
  const r = reason ? ` ${reason}` : "";
  return language === "mr" ? `आज फवारणी करू नका.${r}`.trim()
       : language === "hi"  ? `Aaj spray na karein.${r}`.trim()
       : `Do not spray today.${r}`.trim();
}

/** Organic crop-risk fallback */
function buildOrganicCropRiskActivity(language) {
  const msgs = {
    mr: "फक्त सेंद्रिय: मंजूर बियो-कंट्रोल किंवा निंबोळी तेल; संश्लेषित कीटकनाशक टाळा.",
    hi: "जैविक खेत: केवल नीम तेल / अनुमोदित जैव कीटनाशक; संश्लेषिक स्प्रे न करें।",
    en: "Organic farm: use approved biocontrol or neem-based products only; no synthetic preventive sprays.",
  };
  return {
    type: "CROP_RISK",
    title: language === "mr" ? "पिक संरक्षण" : language === "hi" ? "फसल जोखिम" : "Crop Risk",
    message: truncate(msgs[language] || msgs.en),
    details: { chemical: "—", quantity: "—" },
  };
}

/** Default stub for any missing activity type */
function defaultActivity(type, language) {
  const titles = {
    SPRAY:          { en: "No Spray Needed",    hi: "स्प्रे की जरूरत नहीं", mr: "फवारणी नाही" },
    FERTIGATION:    { en: "No Fertigation",      hi: "खाद की आवश्यकता नहीं", mr: "खत नाही" },
    IRRIGATION:     { en: "Irrigation Adequate", hi: "सिंचाई पर्याप्त",      mr: "सिंचन पुरेसे" },
    WEATHER:        { en: "Weather Normal",       hi: "मौसम सामान्य",         mr: "हवामान सामान्य" },
    CROP_RISK:      { en: "Low Risk",             hi: "कम जोखिम",             mr: "कमी धोका" },
    MONITORING:     { en: "Regular Scouting",     hi: "नियमित निगरानी",       mr: "नियमित सर्वेक्षण" },
    CARBON_TRACKING:{ en: "Carbon Tracking",      hi: "कार्बन ट्रैकिंग",      mr: "कार्बन मागोवा" },
  };
  const messages = {
    SPRAY:          { en: "No spray needed. Continue monitoring.", hi: "Spray ki zarurat nahi. Monitoring jaari rakhe.", mr: "फवारणी नाही. निरीक्षण सुरू ठेवा." },
    FERTIGATION:    { en: "Nutrient management on track.", hi: "Poshan prabandhan theek hai.", mr: "पोषण व्यवस्थापन ठीक आहे." },
    IRRIGATION:     { en: "Soil moisture and weather conditions stable.", hi: "Mitti ki nami theek hai.", mr: "मातीतील ओलावा पुरेसा आहे." },
    WEATHER:        { en: "No weather alerts. Continue standard management.", hi: "Koi mausam chetavni nahi.", mr: "कोणतेही हवामान इशारे नाहीत." },
    CROP_RISK:      { en: "No immediate threats detected.", hi: "Koi turant khatre nahi.", mr: "कोणताही त्वरित धोका नाही." },
    MONITORING:     { en: "Scout field every 2–3 days for stress signs.", hi: "Khet ki niyamit jaanch karein.", mr: "दर 2-3 दिवसांनी शेताची तपासणी करा." },
    CARBON_TRACKING:{ en: "Current practices contributing to carbon reduction.", hi: "Vartman abhyas carbon nigrani ke anusar.", mr: "सध्याच्या पद्धती कार्बन कमी करण्यास मदत करतात." },
  };
  const lang = language || "en";
  return {
    type,
    title: (titles[type]?.[lang] || titles[type]?.en) ?? type,
    message: truncate((messages[type]?.[lang] || messages[type]?.en) ?? "No data."),
    details: {},
  };
}

/**
 * Validate and deterministically override advisory output from LLM.
 *
 * @param {Object|null} llmOutput  - Raw LLM JSON response
 * @param {Object}      evidence   - Full evidence object from evidenceBuilder
 * @param {string}      language   - 'en' | 'hi' | 'mr'
 * @param {Function}    buildFertigationFn - existing buildFertigationActivityFromHints
 * @returns {Object} { activitiesToDo: [...] }
 */
export function postProcessAdvisory(llmOutput, evidence, language, buildFertigationFn) {
  const activities = llmOutput?.activitiesToDo ?? [];
  const activityMap = new Map();
  activities.forEach((a) => activityMap.set(a.type, a));

  const farmType = normalizeTypeOfFarming(evidence?.typeOfFarming);
  const sprayHint = evidence?.decisionHints?.spray;
  const isHarvest  = evidence?.isHarvestStage;

  /* ---- IRRIGATION: always overridden with evidence-based calculation ---- */
  activityMap.set("IRRIGATION", buildIrrigationActivity(evidence, language));

  /* ---- FERTIGATION: always overridden with decision-hint products ---- */
  if (buildFertigationFn) {
    activityMap.set("FERTIGATION", buildFertigationFn(language, evidence));
  }

  /* ---- SPRAY: enforce no-spray rules ---- */
  if (activityMap.has("SPRAY")) {
    const spray = activityMap.get("SPRAY");
    if (!sprayHint?.shouldSpray) {
      activityMap.set("SPRAY", {
        ...spray,
        message: truncate(buildNoSprayMessage(language, sprayHint?.reason || "")),
        details: { reason: sprayHint?.reason || "Conditions not favourable for spray." },
      });
    } else {
      activityMap.set("SPRAY", { ...spray, message: truncate(spray.message) });
    }
  }

  /* ---- CROP_RISK: organic override ---- */
  if (farmType === "Organic" && activityMap.has("CROP_RISK")) {
    activityMap.set("CROP_RISK", buildOrganicCropRiskActivity(language));
  }

  /* ---- Ensure all 7 types present; truncate all messages ---- */
  REQUIRED_TYPES.forEach((type) => {
    if (!activityMap.has(type)) {
      activityMap.set(type, defaultActivity(type, language));
    } else {
      const act = activityMap.get(type);
      activityMap.set(type, { ...act, message: truncate(act.message) });
    }
  });

  /* ---- Emit in canonical order ---- */
  const finalActivities = REQUIRED_TYPES.map((type) => activityMap.get(type));

  return { activitiesToDo: finalActivities };
}
