import { callOpenAI } from "./openaiClient.js";
import { normalizeTypeOfFarming } from "./farmingTypeNormalize.js";

const ACRES_PER_HA = 2.471;

const ACTIVITY_TYPES = [
  "SPRAY",
  "FERTIGATION",
  "IRRIGATION",
  "WEATHER",
  "CROP_RISK",
  "MONITORING",
  "CARBON_TRACKING",
];

const LANGUAGE_MAP = {
  en: "English",
  hi: "Hindi",
  mr: "Marathi",
};

function buildIrrigationMessage(language, evidence) {
  const irrigationType = (evidence?.irrigationType || "").toLowerCase();
  const req = evidence?.irrigationRequirement || {};
  const needs = !!req.needsIrrigation;
  const hours = req.amountHours || 0;
  const minutes = req.amountMinutes || 0;

  const isOpen = irrigationType.includes("open");

  if (!needs) {
    switch (language) {
      case "hi":
        return "Aaj sinchai ki jarurat nahi, mitti ki nami kaafi hai.";
      case "mr":
        return "आज सिंचनाची गरज नाही, मातीतील ओलावा पुरेसा आहे.";
      default:
        return "No irrigation needed today, soil moisture is adequate.";
    }
  }

  if (isOpen) {
    const safeHours = Math.max(1, hours || 1);
    switch (language) {
      case "hi":
        return `Khuli nali se lagbhag ${safeHours} ghante sinchai karein.`;
      case "mr":
        return `खुल्या नळीने सुमारे ${safeHours} तास सिंचन करा.`;
      default:
        return `Give open irrigation for about ${safeHours} hours today.`;
    }
  }

  const safeMinutes = Math.max(30, minutes || 45);
  switch (language) {
    case "hi":
      return `Drip/sprinkler ${safeMinutes} minute chalu rakhein, phir band karein.`;
    case "mr":
      return `ड्रिप/स्प्रिंकलर अंदाजे ${safeMinutes} मिनिटे चालू ठेवा.`;
    default:
      return `Run drip/sprinkler for about ${safeMinutes} minutes today.`;
  }
}

function buildNoSprayMessage(language, reason) {
  const r = reason ? ` ${reason}` : "";
  switch (language) {
    case "hi":
      return `Aaj spray na karein.${r}`.trim();
    case "mr":
      return `आज फवारणी करू नका.${r}`.trim();
    default:
      return `Do not spray today.${r}`.trim();
  }
}

function buildOrganicCropRiskActivity(language) {
  switch (language) {
    case "hi":
      return {
        type: "CROP_RISK",
        title: "फसल जोखिम",
        message:
          "जैविक खेत: केवल नीम तेल / अनुमोदित जैव कीटनाशक; संश्लेषिक स्प्रे न करें। नियमित निगरानी करें।",
        details: {
          chemical: "—",
          quantity: "—",
        },
      };
    case "mr":
      return {
        type: "CROP_RISK",
        title: "पिक संरक्षण",
        message:
          "फक्त सेंद्रिय: मंजूर बियो-कंट्रोल किंवा निंबोळी तेल; संश्लेषित कीटकनाशक टाळा. पिक निरीक्षण करा.",
        details: {
          chemical: "—",
          quantity: "—",
        },
      };
    default:
      return {
        type: "CROP_RISK",
        title: "Crop risk",
        message:
          "Organic farm: use approved biocontrol or neem-based products only; avoid synthetic preventive sprays. Scout the crop daily.",
        details: {
          chemical: "—",
          quantity: "—",
        },
      };
  }
}

function kgPerHaToKgPerAcreLocal(kgPerHa) {
  return Math.round(((Number(kgPerHa) || 0) / ACRES_PER_HA) * 10) / 10;
}

function totalKgForFarmLocal(kgPerHa, acre) {
  return Math.round(kgPerHaToKgPerAcreLocal(kgPerHa) * (Number(acre) || 1) * 10) / 10;
}

function fertigationTitleForType(language, farmType) {
  if (farmType === "Organic") {
    switch (language) {
      case "hi":
        return "जैविक खाद";
      case "mr":
        return "सेंद्रिय खत व्यवस्थापन";
      default:
        return "Organic fertilizer";
    }
  }
  if (farmType === "Inorganic") {
    switch (language) {
      case "hi":
        return "रासायनिक खाद";
      case "mr":
        return "रासायनिक खत व्यवस्थापन";
      default:
        return "Inorganic (chemical) fertilizer";
    }
  }
  switch (language) {
    case "hi":
      return "एकीकृत खाद (जैविक + रासायनिक)";
    case "mr":
      return "एकत्र खत (सेंद्रिय व रासायनिक)";
    default:
      return "Integrated fertilizer (organic + chemical)";
  }
}

/**
 * Build FERTIGATION always from decisionHints (all farming types) so product names + doses stay exact.
 */
function buildFertigationActivityFromHints(language, evidence) {
  const farmType = normalizeTypeOfFarming(evidence?.typeOfFarming);
  const fert = evidence?.decisionHints?.fertigation;
  const acre = evidence?.acre ?? 1;
  const irrigationType = (evidence?.irrigationType || "").toLowerCase();
  const isDrip = irrigationType.includes("drip");
  const methodFallback = isDrip ? "Drip fertigation" : "Broadcast with irrigation";

  const emptyDetails = () => ({
    fertilizer: "",
    quantity: "",
    method: "",
    time: "",
    farmerSteps: [],
    organicProducts: [],
    chemicalProducts: [],
  });

  if (!fert?.shouldFertigate || !fert.hint) {
    const reason = fert?.reason || "";
    const title = fertigationTitleForType(language, farmType);
    if (farmType === "Organic") {
      const msg =
        language === "mr"
          ? `आज सेंद्रिय खत नको. ${reason}`
          : language === "hi"
            ? `आज जैविक खाद नहीं। ${reason}`
            : `No organic fertigation today. ${reason}`;
      return { type: "FERTIGATION", title, message: msg.trim(), details: emptyDetails() };
    }
    if (farmType === "Inorganic") {
      const msg =
        language === "mr"
          ? `आज रासायनिक खत नको. ${reason}`
          : language === "hi"
            ? `आज रासायनिक खाद नहीं। ${reason}`
            : `No chemical fertigation today. ${reason}`;
      return { type: "FERTIGATION", title, message: msg.trim(), details: emptyDetails() };
    }
    const msg =
      language === "mr"
        ? `आज खत देण्याची गरज नाही. ${reason}`
        : language === "hi"
          ? `आज खाद की आवश्यकता नहीं। ${reason}`
          : `No fertigation needed today. ${reason}`;
    return { type: "FERTIGATION", title, message: msg.trim(), details: emptyDetails() };
  }

  const hint = fert.hint;

  if (farmType === "Organic") {
    const prods = Array.isArray(hint.products) ? hint.products : [];
    const quantityLine = prods
      .map((p) => `${p.name} (${p.composition || "organic"}) — ${p.quantity}`)
      .join(" | ");
    const timeStr = hint.time || "";
    const message =
      language === "mr"
        ? `सेंद्रिय: ${quantityLine}. वेळ: ${timeStr}`
        : language === "hi"
          ? `जैविक: ${quantityLine}. समय: ${timeStr}`
          : `Organic: ${quantityLine}. Time: ${timeStr}`;
    return {
      type: "FERTIGATION",
      title: fertigationTitleForType(language, "Organic"),
      message,
      details: {
        fertilizer: prods.map((p) => p.name).join(", "),
        quantity: quantityLine || "",
        method: hint.method || methodFallback,
        time: timeStr,
        farmerSteps: Array.isArray(hint.farmerSteps) ? hint.farmerSteps : [],
        organicProducts: prods.map((p) => ({
          name: p.name,
          composition: p.composition || "",
          quantity: p.quantity,
          method: p.method || "",
        })),
        chemicalProducts: [],
      },
    };
  }

  if (farmType === "Inorganic") {
    const farmLabel =
      language === "mr"
        ? "या शेतासाठी एकूण"
        : language === "hi"
          ? "खेत के लिए कुल"
          : "total for this farm";
    const chemRows = (fert.products || []).map((p) => {
      if (p.quantityPerAcre) {
        return {
          name: p.name,
          quantity: `${p.name}: ${p.quantityPerAcre} (${farmLabel})`,
          method: methodFallback,
        };
      }
      const kgA = kgPerHaToKgPerAcreLocal(p.quantityKgPerHa);
      const tot = totalKgForFarmLocal(p.quantityKgPerHa, acre);
      return {
        name: p.name,
        quantity: `${p.name}: ~${kgA} kg/acre, ${farmLabel} ~${tot} kg`,
        method: methodFallback,
      };
    });

    const quantityBlock =
      hint.quantity ||
      chemRows.map((r) => r.quantity).join(" | ") ||
      "";

    const message =
      language === "mr"
        ? `रासायनिक: ${quantityBlock}. ${hint.time || ""}`
        : language === "hi"
          ? `रासायनिक: ${quantityBlock}. ${hint.time || ""}`
          : `Chemical: ${quantityBlock}. ${hint.time || ""}`;

    return {
      type: "FERTIGATION",
      title: fertigationTitleForType(language, "Inorganic"),
      message,
      details: {
        fertilizer: hint.fertilizer || chemRows.map((r) => r.name).join(", "),
        quantity: quantityBlock,
        method: hint.method || methodFallback,
        time: hint.time || "",
        farmerSteps: Array.isArray(hint.farmerSteps) ? hint.farmerSteps : [],
        organicProducts: [],
        chemicalProducts: chemRows.map((r) => ({
          name: r.name,
          quantity: r.quantity,
          method: r.method,
        })),
      },
    };
  }

  // Integrated — organic + chemical portions with full lines
  const org = Array.isArray(hint.organicPortion) ? hint.organicPortion : [];
  const chem = Array.isArray(hint.chemicalPortion) ? hint.chemicalPortion : [];
  const orgLine = org
    .map((p) => `${p.name}${p.composition ? ` (${p.composition})` : ""}: ${p.quantity}`)
    .join(" | ");
  const chemLine = chem.map((p) => `${p.name}: ${p.quantityPerAcre}`).join(" | ");
  const seq = hint.sequence || "";
  const timeStr = hint.time || "";

  const message =
    language === "mr"
      ? `सेंद्रिय: ${orgLine || "—"}. रासायनिक: ${chemLine || "—"}.${seq ? ` क्रम: ${seq}.` : ""} ${timeStr}`.trim()
      : language === "hi"
        ? `जैविक: ${orgLine || "—"}. रासायनिक: ${chemLine || "—"}.${seq ? ` क्रम: ${seq}.` : ""} ${timeStr}`.trim()
        : `Organic: ${orgLine || "—"}. Chemical: ${chemLine || "—"}.${seq ? ` Sequence: ${seq}.` : ""} ${timeStr}`.trim();

  return {
    type: "FERTIGATION",
    title: fertigationTitleForType(language, "Integrated"),
    message,
    details: {
      fertilizer: [...org.map((p) => p.name), ...chem.map((p) => p.name)].join(", "),
      quantity: [orgLine, chemLine].filter(Boolean).join(" | "),
      method: seq || methodFallback,
      time: timeStr,
      farmerSteps: Array.isArray(hint.farmerSteps) ? hint.farmerSteps : [],
      organicProducts: org.map((p) => ({
        name: p.name,
        composition: p.composition || "",
        quantity: p.quantity,
        method: p.method || "",
      })),
      chemicalProducts: chem.map((p) => ({
        name: p.name,
        quantity: p.quantityPerAcre,
        method: p.method || "",
      })),
    },
  };
}

export async function generateSmartAdvisory({
  language = "en",
  evidence,
  farmerName = "Farmer",
}) {
  const selectedLanguage = LANGUAGE_MAP[language] || "English";

  const prompt = buildLLMPrompt(selectedLanguage, evidence);

  const response = await callOpenAI(prompt);

  if (!response || !Array.isArray(response.activitiesToDo)) {
    throw new Error("Invalid advisory response from LLM");
  }

  // Ensure ALL 7 activities exist; cap message length for WhatsApp (~160 safe for templates)
  const WHATSAPP_MESSAGE_MAX = 155;
  const map = new Map();
  response.activitiesToDo.forEach((a) => map.set(a.type, a));

  const truncateMessage = (text, maxLen = WHATSAPP_MESSAGE_MAX) => {
    if (!text || typeof text !== "string") return text || "";
    const trimmed = text.trim();
    if (trimmed.length <= maxLen) return trimmed;
    return trimmed.slice(0, maxLen - 3) + "...";
  };

  const farmType = normalizeTypeOfFarming(evidence?.typeOfFarming);

  const finalActivities = ACTIVITY_TYPES.map((type) => {
    let activity = map.get(type) || {
      type,
      title: "No action required",
      message: `No action required for ${type.toLowerCase()} today.`,
      details: {},
    };

    if (type === "IRRIGATION") {
      activity = {
        ...activity,
        message: buildIrrigationMessage(language, evidence),
      };
    }

    if (type === "FERTIGATION") {
      activity = buildFertigationActivityFromHints(language, evidence);
    }

    const sprayHint = evidence?.decisionHints?.spray;
    if (type === "SPRAY" && !sprayHint?.shouldSpray) {
      activity = {
        ...activity,
        title:
          language === "mr" || language === "hi" ? "फवारणी" : "Spray",
        message: buildNoSprayMessage(language, sprayHint?.reason || ""),
      };
    }

    if (type === "CROP_RISK" && farmType === "Organic") {
      activity = buildOrganicCropRiskActivity(language);
    }

    return {
      ...activity,
      message: truncateMessage(activity.message, WHATSAPP_MESSAGE_MAX),
    };
  });

  return { activitiesToDo: finalActivities };
}

/* =====================================================
   PROMPT (LANGUAGE HARD FORCED)
===================================================== */

function buildLLMPrompt(languageName, evidence) {
  const farmAcresRaw = evidence?.acre ?? evidence?.area ?? 1;
  const farmAcresNum = Number(farmAcresRaw);
  const farmAcres =
    Number.isFinite(farmAcresNum) && farmAcresNum > 0 ? farmAcresNum : 1;
  const exampleTotalKg = Math.round(5 * farmAcres * 100) / 100;
  const farmType = normalizeTypeOfFarming(evidence?.typeOfFarming);

  return `
You are a senior agronomist generating DAILY PRECISION FARM ADVISORY.

━━━━━━━━━━━━━━━━━━━━
🚨 ABSOLUTE RULES (STRICT)
━━━━━━━━━━━━━━━━━━━━
1. Output ONLY in ${languageName} — simple, village-style, WhatsApp-friendly. No other language mixed in.
2. Do NOT use the farmer’s name, the word "Farmer", folded hands emoji, or any greeting prefix in any "message" field.
3. One activity = ONE short actionable sentence; each "message" MUST stay under ~155 characters (WhatsApp); put full product names and kg/acre totals in "details" only if needed.
4. NO vague phrases: "as per label", "recommended dose", "if needed", "as required", "appropriate", bare "NPK" without grade.
5. Fertilizers and sprays: ALWAYS full commercial names + grade where applicable, e.g. "Urea 46%", "DAP 18:46:0", "MOP 60%", "NPK 19:19:19", "NPK 13:0:45", "Zn EDTA 12%"; organic: "Vermicompost", "Jeevamruth", "Neem cake", etc., each with numeric quantity (kg/acre or L/acre) and farm total when relevant.
6. ALWAYS give NUMERIC doses: kg/acre, litre/acre, ml per litre of spray water, hours/minutes for irrigation.
7. Use ONLY the evidence below. If decisionHints say skip an action, say so clearly. Do not invent pests, diseases, or products.
8. NO SCIENCE JARGON in farmer text: ❌ NDVI, BBCH, ET0, HSI, index names. ✅ crop stage, soil, weather in plain words.

━━━━━━━━━━━━━━━━━━━━
📐 AREA RULE (CRITICAL)
━━━━━━━━━━━━━━━━━━━━
Farm size: ${farmAcres} acre(s)

For every solid or liquid input (fertilizer, manure, spray mix totals):
- State per-acre rate (e.g. kg/acre, L/acre)
- AND total for this farm: total = per_acre × ${farmAcres}
  Example: 5 kg/acre × ${farmAcres} = ${exampleTotalKg} kg total (use correct math for your own per-acre values).
- Put the clearest summary in "message" (within ~155 chars); full breakdown may go in details.quantity / details fields.

━━━━━━━━━━━━━━━━━━━━
🎯 CORE PRINCIPLE
━━━━━━━━━━━━━━━━━━━━
The farmer must instantly see: what EXACTLY to do today (inputs, amounts, timing).

━━━━━━━━━━━━━━━━━━━━
🌱 FARMING TYPE (evidence.typeOfFarming → ${farmType})
━━━━━━━━━━━━━━━━━━━━
Apply this to EVERY relevant activity (SPRAY, FERTIGATION, CROP_RISK, etc.):
• Organic: ONLY organic / bio inputs everywhere. NO synthetic fertilizers or synthetic pesticides in text. SPRAY/CROP_RISK → neem, biocontrol, monitoring — never recommend urea, DAP, NPK, or chemical fungicide/insecticide by name.
• Inorganic: ONLY synthetic/chemical fertilizers and (if justified) chemical crop protection. NO vermicompost, jeevamruth, FYM, neem cake as fertilizer. Use full product names + doses.
• Integrated: BOTH organic-style base inputs AND chemical fertilizers/chemistry as per decisionHints; label which is which; full names + quantities for each.

━━━━━━━━━━━━━━━━━━━━
🌾 HARD AGRICULTURE RULES
━━━━━━━━━━━━━━━━━━━━
• SPRAY only when justified: name + formulation; dose (ml or g per litre of water); water volume (litre/acre or tanks); time (morning/evening). If wind high OR rain probability > 40% → NO spray.
• FERTIGATION: exact product names (not bare "NPK"); kg/acre + total AND/OR L/acre + total; no unreal heavy doses. Organic reference bands when hint lacks a number: vermicompost 40–80 kg/acre once per cycle; neem cake 10–25 kg/acre; liquid organics ~2–5 L/acre — still prefer decisionHints.fertigation numbers when present.
• IRRIGATION: litres/acre + total OR hours/minutes; open-irrigation → prefer HOURS; drip/sprinkler → minutes or hours. If soil moisture adequate / shouldIrrigate false → no irrigation.
• HARVEST STAGE (evidence.isHarvestStage === true): NO spray, NO fertigation — harvest planning, weather, monitoring, carbon only.
• LOW confidence: say clearly to avoid major inputs today; emphasize monitoring.

━━━━━━━━━━━━━━━━━━━━
🧠 DECISION ENGINE
━━━━━━━━━━━━━━━━━━━━
Always align with evidence.decisionHints: spray.shouldSpray, irrigation.shouldIrrigate, fertigation.shouldFertigate, monitoring.hint.
If crop stress is indicated → slightly increase allowed nutrition (within that farm type’s rules), do not contradict hints.

━━━━━━━━━━━━━━━━━━━━
🎯 ACTIVITY TYPES (GENERATE ALL 7)
━━━━━━━━━━━━━━━━━━━━
["SPRAY","FERTIGATION","IRRIGATION","WEATHER","CROP_RISK","MONITORING","CARBON_TRACKING"]

────────────────────
SPRAY — follow decisionHints.spray; respect wind/rain; Organic farms → no chemical spray.
FERTIGATION — match evidence.typeOfFarming: Organic = hint.products only; Inorganic = chemical hint.fertilizer + hint.quantity + formulation list, no organic rows; Integrated = organicPortion + chemicalPortion + sequence. If shouldFertigate is false, mirror hint.reason.
IRRIGATION — follow decisionHints.irrigation and irrigationRequirement.
WEATHER — actionable only; no forecast dumps.
CROP_RISK — align with decisionHints; Inorganic/Integrated may use preventive chemistry with formulation + dose; Organic → monitoring / bio only.
MONITORING — decisionHints.monitoring.hint; stress zones if present.
CARBON_TRACKING — evidence.carbonData; else short "not available" message; numeric fields in details.

━━━━━━━━━━━━━━━━━━━━
📊 EVIDENCE
━━━━━━━━━━━━━━━━━━━━
${JSON.stringify(evidence, null, 2)}

━━━━━━━━━━━━━━━━━━━━
📦 OUTPUT FORMAT (STRICT JSON ONLY)
━━━━━━━━━━━━━━━━━━━━
{
  "activitiesToDo": [
    {
      "type": "SPRAY",
      "title": "string",
      "message": "string",
      "details": {
        "chemical": "string",
        "quantity": "string",
        "method": "string",
        "time": "string"
      }
    },
    {
      "type": "FERTIGATION",
      "title": "string",
      "message": "string",
      "details": {
        "fertilizer": "string",
        "quantity": "string",
        "method": "string",
        "time": "string",
        "farmerSteps": ["string"],
        "organicProducts": [{"name": "string", "composition": "string", "quantity": "string", "method": "string"}],
        "chemicalProducts": [{"name": "string", "quantity": "string", "method": "string"}]
      }
    },
    {
      "type": "IRRIGATION",
      "title": "string",
      "message": "string",
      "details": {
        "quantity": "string",
        "method": "string",
        "time": "string"
      }
    },
    {
      "type": "WEATHER",
      "title": "string",
      "message": "string",
      "details": {}
    },
    {
      "type": "CROP_RISK",
      "title": "string",
      "message": "string",
      "details": {
        "chemical": "string",
        "quantity": "string"
      }
    },
    {
      "type": "MONITORING",
      "title": "string",
      "message": "string",
      "details": {
        "zone": "string",
        "checks": "string"
      }
    },
    {
      "type": "CARBON_TRACKING",
      "title": "string",
      "message": "string",
      "details": {
        "emissionKgCO2": 0,
        "capturedKgCO2": 0,
        "netBalanceKgCO2": 0
      }
    }
  ]
}

Now generate TODAY'S advisory.
`;
}
