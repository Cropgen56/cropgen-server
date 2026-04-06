import { callOpenAI } from "./openaiClient.js";
import { normalizeTypeOfFarming } from "./farmingTypeNormalize.js";
import { postProcessAdvisory } from "./postProcessAdvisory.js";

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
    console.warn(
      "Advisory LLM returned no usable JSON (check OPENAI_API_KEY and logs above); skipping AI activities",
    );
    return null;
  }

  /* Post-process: deterministic overrides on top of LLM text.
     buildFertigationActivityFromHints is defined earlier in this file. */
  return postProcessAdvisory(response, evidence, language, buildFertigationActivityFromHints);
}

/* =====================================================
   PROMPT (REFINED — uses precision evidence fields)
===================================================== */

function buildLLMPrompt(languageName, evidence) {
  const farmAcresRaw = evidence?.acre ?? 1;
  const farmAcresNum = Number(farmAcresRaw);
  const farmAcres =
    Number.isFinite(farmAcresNum) && farmAcresNum > 0 ? farmAcresNum : 1;
  const exampleTotalKg = Math.round(5 * farmAcres * 100) / 100;
  const farmType = normalizeTypeOfFarming(evidence?.typeOfFarming);

  const irrReq      = evidence?.irrigationRequirement;
  const fertSched   = evidence?.fertilizerSchedule;
  const stressZ     = evidence?.stressZones;
  const soilMoi     = evidence?.soilMoisture;
  const irrSummary  = irrReq?.recommendation ?? "Check soil moisture before irrigating.";
  const currentFert = fertSched?.currentApplication;
  const fertSummary = currentFert
    ? `BBCH ${currentFert.bbchWindow}: N=${currentFert.N_kgPerHa} P=${currentFert.P_kgPerHa} K=${currentFert.K_kgPerHa} kg/ha. ${currentFert.timing}.`
    : "No active fertigation window.";
  const diseasePressure = stressZ?.diseasePressure ?? "low";
  const soilStatus      = soilMoi?.status ?? "ADEQUATE";

  return `You are a senior agronomist generating a DAILY PRECISION FARM ADVISORY.

ABSOLUTE RULES (never violate):
1. Output ONLY in ${languageName} — simple, WhatsApp-friendly. No language mixing.
2. No farmer name, no "Farmer" word, no folded-hands emoji in any "message" field.
3. Each "message" <= 155 characters. Full product names, doses, and math go in "details".
4. No vague phrases: "as per label", "recommended dose", "if needed", "appropriate amount".
5. Full commercial names + grade: "Urea 46%", "DAP 18:46:0", "MOP 60%", "NPK 19:19:19", "Mancozeb 75% WP". Organic: "Vermicompost", "Neem cake", "Jeevamruth" with kg/acre or L/acre.
6. NUMERIC doses everywhere: kg/acre, L/acre, ml/L spray water, hours/minutes for irrigation.
7. Use ONLY the evidence provided. Do NOT invent pests, diseases, products, or data.
8. No jargon in farmer text. No NDVI, BBCH, ET0, HSI. Use: crop stage, soil moisture, weather conditions.

AREA RULE (critical):
Farm: ${farmAcres} acre(s). For every input, state per-acre rate AND total (rate x ${farmAcres}).
Example: 5 kg/acre x ${farmAcres} = ${exampleTotalKg} kg total.

FARMING TYPE: ${farmType}
- Organic: bio/organic inputs ONLY. No Urea, DAP, NPK, or chemical pesticides.
- Inorganic: chemical fertilizers + crop protection chemicals ONLY. No FYM or vermicompost.
- Integrated: organic base + targeted chemical; label each clearly.

PRECISION CONTEXT (pre-computed - use exactly as given):
IRRIGATION (ET0-based): ${irrSummary}
  Soil status: ${soilStatus}. Criticality: ${irrReq?.criticality ?? "MODERATE"}.
  NOTE: The irrigation activity message will be overridden by code. Focus your irrigation text on the schedule context.

FERTIGATION (BBCH schedule): ${fertSummary}
  Use products in evidence.fertilizerSchedule.currentApplication. Exact doses already computed.

DISEASE PRESSURE: ${diseasePressure}
Water-stressed area: ${stressZ?.percentageWaterStressed ?? 0}% of field.
Nitrogen-deficient area: ${stressZ?.percentageNitrogenDeficient ?? 0}% of field.

HARD AGRONOMY RULES:
- SPRAY: if evidence.decisionHints.spray.shouldSpray === false, message = "No spray today." + reason. Otherwise include product + formulation + dose (ml or g/L water) + water vol (L/acre) + time.
- SPRAY wind/rain gate: wind > 15 km/h OR rain probability > 40% means no spray.
- FERTIGATION: follow evidence.fertilizerSchedule.currentApplication products + doses. If null, say "No fertigation at current stage."
- IRRIGATION: use evidence.irrigationRequirement.recommendation text. Do NOT change amounts.
- HARVEST STAGE (isHarvestStage=true): no spray, no fertigation - harvest planning only.
- If stressZones.diseasePressure=high AND shouldSpray=true, escalate in CROP_RISK too.

GENERATE ALL 7 ACTIVITY TYPES: ["SPRAY","FERTIGATION","IRRIGATION","WEATHER","CROP_RISK","MONITORING","CARBON_TRACKING"]

SPRAY       - follow decisionHints.spray; respect wind/rain/organic rules.
FERTIGATION - current BBCH window products + doses from evidence.fertilizerSchedule; farm-type rules.
IRRIGATION  - evidence.irrigationRequirement.recommendation text.
WEATHER     - actionable only; flag temperature extremes or disease risk.
CROP_RISK   - decisionHints.spray + stressZones; Inorganic/Integrated = chemical with dose; Organic = bio/monitoring only.
MONITORING  - decisionHints.monitoring.hint + stress zone percentages; frequency.
CARBON_TRACKING - evidence.carbonData; numeric CO2 fields in details.

FULL EVIDENCE (JSON):
${JSON.stringify(evidence, null, 2)}

OUTPUT - STRICT JSON ONLY, NO MARKDOWN:
{
  "activitiesToDo": [
    { "type": "SPRAY",    "title": "string", "message": "string", "details": { "chemical": "string", "quantity": "string", "method": "string", "time": "string" } },
    { "type": "FERTIGATION", "title": "string", "message": "string", "details": { "fertilizer": "string", "quantity": "string", "method": "string", "time": "string", "farmerSteps": ["string"], "organicProducts": [{"name":"string","composition":"string","quantity":"string","method":"string"}], "chemicalProducts": [{"name":"string","quantity":"string","method":"string"}] } },
    { "type": "IRRIGATION",  "title": "string", "message": "string", "details": { "quantity": "string", "method": "string", "time": "string", "discharge": "string", "frequency": "string" } },
    { "type": "WEATHER",     "title": "string", "message": "string", "details": { "temperature": "string", "humidity": "string", "wind": "string", "action": "string" } },
    { "type": "CROP_RISK",   "title": "string", "message": "string", "details": { "chemical": "string", "quantity": "string", "riskLevel": "string", "monitoringFrequency": "string" } },
    { "type": "MONITORING",  "title": "string", "message": "string", "details": { "zone": "string", "checks": "string", "frequency": "string" } },
    { "type": "CARBON_TRACKING", "title": "string", "message": "string", "details": { "emissionKgCO2": 0, "capturedKgCO2": 0, "netBalanceKgCO2": 0 } }
  ]
}

Generate TODAY'S advisory. Output ONLY the JSON — no markdown, no explanation.`;
}
