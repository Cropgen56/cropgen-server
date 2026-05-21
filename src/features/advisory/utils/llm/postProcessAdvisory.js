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

// Language-aware character limits
const MESSAGE_MAX = {
  en: 300,
  hi: 280,
  mr: 280,
  te: 280,
  default: 280,
};

function truncate(text, language = "en") {
  if (!text || typeof text !== "string") return text || "";
  const max = MESSAGE_MAX[language] ?? MESSAGE_MAX.default;
  const t = text.trim();
  return t.length <= max ? t : `${t.slice(0, max - 3)}...`;
}

function defaultActivity(type, language) {
  const noUpdateMessages = {
    en: "No advisory update.",
    hi: "आज कोई सलाह नहीं।",
    mr: "आज कोणतीही सूचना नाही.",
    te: "ఈరోజు సలహా అవసరం లేదు.",
    default: "No advisory update.",
  };
  return {
    type,
    title: type,
    message: noUpdateMessages[language] ?? noUpdateMessages.default,
    details: {},
  };
}

function buildIrrigationActivity(evidence, language) {
  const req = evidence?.irrigationRequirement ?? {};
  const shouldIrrigate = req.shouldIrrigate ?? req.needsIrrigation ?? false;
  const irrigationType = (evidence?.irrigationType || "").toLowerCase();
  const isOpen = irrigationType.includes("open") || irrigationType.includes("flood");
  const acre = evidence?.acre ?? 1;

  // Multi-language irrigation messages
  const getMessage = () => {
    if (!shouldIrrigate) {
      const skipMsgs = {
        en: req.reason || "Soil moisture adequate. No irrigation needed today.",
        hi: req.reason ? translateToHindi(req.reason) : "मिट्टी में पर्याप्त नमी है। आज सिंचाई की जरूरत नहीं।",
        mr: req.reason ? req.reason : "जमिनीत पुरेसा ओलावा आहे. आज सिंचन नको.",
        te: "నేల తేమ సరిపోతుంది. ఈరోజు నీరు పెట్టవద్దు.",
      };
      return skipMsgs[language] ?? skipMsgs.en;
    }

    const totalWater = req.totalWater_m3 ? `${req.totalWater_m3 * 1000} litre` : "";
    const discharge = req.discharge_lmin ? `${req.discharge_lmin} L/min` : "";

    if (isOpen) {
      const hrs = req.amountHours || req.durationHours || 1;
      const msgs = {
        en: `Open irrigation: ${hrs} hours. ${totalWater ? `Total ~${totalWater}` : ""}. Apply morning 6–8 AM.`,
        hi: `खुली सिंचाई: ${hrs} घंटे। ${totalWater ? `कुल ~${totalWater}` : ""}. सुबह 6–8 बजे करें।`,
        mr: `खुल्या नळाने सिंचन: ${hrs} तास. ${totalWater ? `एकूण ~${totalWater}` : ""}. सकाळी 6–8 वाजता करा.`,
        te: `తెరిచిన నీటిపారుదల: ${hrs} గంటలు. ఉదయం 6–8 గంటలకు ఇవ్వండి.`,
      };
      return msgs[language] ?? msgs.en;
    } else {
      const mins = req.amountMinutes || req.durationMinutes || 45;
      const mm = req.waterRequirement_mm ?? 0;
      const msgs = {
        en: `Drip/sprinkler: run ${mins} min. ${mm > 0 ? `Apply ${mm} mm` : ""}. ${discharge ? `Flow: ${discharge}` : ""}. Morning 6–9 AM.`,
        hi: `ड्रिप/स्प्रिंकलर: ${mins} मिनट चलाएं। ${mm > 0 ? `${mm} mm पानी दें।` : ""} सुबह 6–9 बजे।`,
        mr: `ठिबक/स्प्रिंकलर: ${mins} मिनिटे चालवा. ${mm > 0 ? `${mm} mm पाणी द्या.` : ""} सकाळी 6–9 वाजता.`,
        te: `డ్రిప్/స్ప్రింక్లర్: ${mins} నిమిషాలు నడపండి. ఉదయం 6–9 గంటలకు.`,
      };
      return msgs[language] ?? msgs.en;
    }
  };

  const getTitles = () => ({
    en: "Irrigation Schedule",
    hi: "सिंचाई अनुसूची",
    mr: "सिंचन वेळापत्रक",
    te: "నీటిపారుదల షెడ్యూల్",
  });

  return {
    type: "IRRIGATION",
    title: (getTitles()[language] ?? getTitles().en),
    message: truncate(getMessage(), language),
    details: {
      applicationMethod: shouldIrrigate
        ? isOpen ? "Flood / Open irrigation" : "Drip / Sprinkler"
        : "No irrigation required",
      timing: language === "mr" ? "सकाळी 6–10 वाजता"
        : language === "hi" ? "सुबह 6–10 बजे"
        : "Morning (6–10 AM)",
      duration: shouldIrrigate
        ? isOpen
          ? `${req.durationHours ?? req.amountHours ?? 0} hours`
          : `${req.durationMinutes ?? req.amountMinutes ?? 0} minutes`
        : "Not required",
      waterQuantity: req.waterRequirement_mm
        ? `${req.waterRequirement_mm} mm (${req.totalWater_m3 ?? 0} m³ = ${(req.totalWater_m3 ?? 0) * 1000} litres)`
        : "Not required",
      discharge: req.discharge_lmin ? `${req.discharge_lmin} L/min` : "",
      reason: req.reason || "Soil moisture and ET-based recommendation.",
      frequency: req.frequencyDays ? `Every ${req.frequencyDays} days` : "",
      criticality: req.criticality ?? "",
      confidence: req.dataConfidence || "high",
    },
  };
}

// Minimal inline translation for irrigation skip reason (hi)
function translateToHindi(text) {
  if (!text) return text;
  if (text.includes("Rain expected")) return "बारिश की संभावना है। आज सिंचाई न करें।";
  if (text.includes("Soil moisture adequate")) return "मिट्टी में पर्याप्त नमी है।";
  return text;
}

export function postProcessAdvisory(llmOutput, evidence, language, buildFertigationFn) {
  const activities = llmOutput?.activitiesToDo ?? [];
  const activityMap = new Map();
  activities.forEach((a) => activityMap.set(a.type, a));

  // Always override IRRIGATION with calculated values
  activityMap.set("IRRIGATION", buildIrrigationActivity(evidence, language));

  // Always override FERTIGATION with decision engine output
  if (buildFertigationFn) {
    activityMap.set("FERTIGATION", buildFertigationFn(language, evidence));
  }

  // Organic spray guard — but allow bio-pesticide recommendation
  const farmType = normalizeTypeOfFarming(evidence?.typeOfFarming);
  if (farmType === "Organic" && activityMap.has("SPRAY")) {
    const spray = activityMap.get("SPRAY");
    // Only override if message still says "no spray" generically
    if (spray.message?.toLowerCase().includes("no chemical") ||
        spray.message?.toLowerCase().includes("synthetic")) {
      const organicSprayMessages = {
        en: "Organic farm: use approved bio-pesticides only. Neem Oil 10000PPM (5ml/L) or Beauveria bassiana (5g/L), 200L/acre, morning spray.",
        hi: "जैविक खेत: केवल बायो-कीटनाशक उपयोग करें। नीम ऑयल 10000 PPM 5 ml/L या Beauveria bassiana 5 g/L, 200 लीटर/एकड़, सुबह स्प्रे करें।",
        mr: "सेंद्रिय शेती: फक्त बायो-कीटकनाशक वापरा. निम ऑइल 10000 PPM 5 ml/L किंवा Beauveria bassiana 5 g/L, 200 लिटर/एकर, सकाळी फवारणी करा.",
        te: "సేంద్రీయ వ్యవసాయం: జీవ-పురుగుమందులు మాత్రమే. నీమ్ ఆయిల్ 5 ml/L, 200L/ఎకరం, ఉదయం పిచికారి.",
      };
      activityMap.set("SPRAY", {
        ...spray,
        message: truncate(
          organicSprayMessages[language] ?? organicSprayMessages.en,
          language
        ),
      });
    }
  }

  // Ensure all required types present; truncate messages
  REQUIRED_TYPES.forEach((type) => {
    if (!activityMap.has(type)) {
      activityMap.set(type, defaultActivity(type, language));
    } else {
      const act = activityMap.get(type);
      activityMap.set(type, {
        ...act,
        title: typeof act.title === "string" && act.title ? act.title : type,
        message: truncate(act.message, language),
        details: act.details && typeof act.details === "object" ? act.details : {},
      });
    }
  });

  return { activitiesToDo: REQUIRED_TYPES.map((type) => activityMap.get(type)) };
}
