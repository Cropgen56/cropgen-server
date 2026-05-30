import {
  BIODROPS_CROP_ALIASES,
  BIODROPS_PRODUCT_CATALOG,
  BIODROPS_PRODUCT_IDS,
  KERALA_CROP_DOSAGES,
} from "../data/precisionFarmingKit.js";

function normalizeCropKey(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
}

export function resolveBiodropsCropKey(cropName) {
  const key = normalizeCropKey(cropName);
  return BIODROPS_CROP_ALIASES[key] ?? "vegetables";
}

function formatDoseRange(dose) {
  if (dose.amountMax != null && dose.amountMax !== dose.amount) {
    return `${dose.amount}–${dose.amountMax} ${dose.unit}`;
  }
  return `${dose.amount} ${dose.unit}`;
}

function scalePerAcreDose(dose, acre) {
  const acres = Number(acre) || 1;
  const match = /^([\d.]+)\s*(\w+)\/acre$/.exec(dose.unit);
  if (!match || acres === 1) {
    return formatDoseRange(dose);
  }
  const unit = match[2];
  const total = Math.round(dose.amount * acres * 10) / 10;
  const maxTotal =
    dose.amountMax != null
      ? Math.round(dose.amountMax * acres * 10) / 10
      : null;
  if (maxTotal != null && maxTotal !== total) {
    return `${formatDoseRange(dose)} (~${total}–${maxTotal} ${unit} total for ${acres} acre)`;
  }
  return `${formatDoseRange(dose)} (~${total} ${unit} total for ${acres} acre)`;
}

function formatDosageForFarm(dose, doseUnit, acre) {
  if (doseUnit === "per_acre") {
    return scalePerAcreDose(dose, acre);
  }
  return formatDoseRange(dose);
}

/**
 * Pick stage-relevant products for LLM hints (full catalog still returned for UI cards).
 * @param {number} bbchStage
 * @param {'crop' | 'barren'} mode
 */
function selectActiveProductIds(bbchStage, mode) {
  if (mode === "barren") {
    return ["bokashi", "trichoderma", "pseudomonas", "azospirillum", "psb"];
  }

  const stage = Number(bbchStage) || 0;
  if (stage < 20) {
    return ["bokashi", "azospirillum", "psb", "trichoderma", "pseudomonas", "vam"];
  }
  if (stage < 61) {
    return BIODROPS_PRODUCT_IDS;
  }
  if (stage < 85) {
    return ["bokashi", "kmb", "pseudomonas", "trichoderma", "vam"];
  }
  return ["bokashi", "pseudomonas"];
}

function buildApplicationNote(schedule, bbchStage, mode) {
  if (mode === "barren") {
    return `Pre-sowing soil prep for ${schedule.label}: apply Bokashi with Trichoderma and Pseudomonas in moist soil before sowing.`;
  }

  const stage = Number(bbchStage) || 0;
  const base = schedule.application;
  if (stage < 20) {
    return `${base} — focus on land preparation / basal application now.`;
  }
  if (stage >= 61 && stage < 85) {
    return `${base} — emphasize KMB and VAM during flowering and fruiting.`;
  }
  return base;
}

/**
 * @param {{
 *   cropName?: string,
 *   acre?: number,
 *   bbchStage?: number,
 *   typeOfFarming?: string,
 *   mode?: 'crop' | 'barren',
 * }} params
 */
export function getBiodropsRecommendations({
  cropName,
  acre = 1,
  bbchStage = 0,
  typeOfFarming = "Integrated",
  mode = "crop",
} = {}) {
  const cropKey = resolveBiodropsCropKey(cropName);
  const schedule = KERALA_CROP_DOSAGES[cropKey] ?? KERALA_CROP_DOSAGES.vegetables;
  const activeIds = new Set(selectActiveProductIds(bbchStage, mode));
  const applicationNote = buildApplicationNote(schedule, bbchStage, mode);

  /** @type {Array<{ productName: string, productImageUrl: string, productSourceUrl: string | null, description: string }>} */
  const recommendedProducts = [];
  /** @type {Array<{ productName: string, role: string, dosage: string, applicationTiming: string, method: string, priority: 'high' | 'normal' }>} */
  const productHints = [];

  for (const productId of BIODROPS_PRODUCT_IDS) {
    const meta = BIODROPS_PRODUCT_CATALOG[productId];
    const dose = schedule.doses[productId];
    if (!meta || !dose) continue;

    const dosage = formatDosageForFarm(dose, schedule.doseUnit, acre);
    const description = `${meta.tagline}. Recommended: ${dosage}. Timing: ${applicationNote}. ${meta.defaultMethod}.`;

    recommendedProducts.push({
      productName: meta.productName,
      productImageUrl: meta.productImageUrl,
      productSourceUrl: meta.productSourceUrl,
      description,
    });

    if (activeIds.has(productId)) {
      productHints.push({
        productName: meta.productName,
        role: meta.role,
        dosage,
        applicationTiming: applicationNote,
        method: meta.defaultMethod,
        priority: productId === "bokashi" ? "high" : "normal",
      });
    }
  }

  return {
    cropKey,
    cropLabel: schedule.label,
    applicationNote,
    typeOfFarming,
    recommendedProducts,
    productHints,
  };
}

/**
 * LLM prompt block injected only for BIODROPS organization advisories.
 * @param {ReturnType<typeof getBiodropsRecommendations> | null} biodrops
 */
export function buildBiodropsAdvisoryPromptBlock(biodrops) {
  if (!biodrops?.productHints?.length) return "";

  const farming = String(biodrops.typeOfFarming || "Integrated");
  const organicOnly =
    farming.toLowerCase() === "organic"
      ? "Recommend ONLY Biodrops bio-inputs and Bokashi — do not suggest chemical NPK or synthetic pesticides."
      : "Lead with Biodrops bio-inputs. Mention chemical NPK only if nutrient deficit is severe and farming type allows it.";

  return `
BIODROPS PRODUCT RULES (MANDATORY — this farmer is a Biodrops / Satagro user):
- Prefer Biodrops Precision Farming products in FERTIGATION, SPRAY (bio-control), and MONITORING activities.
- Crop chart: ${biodrops.cropLabel}. Application guidance: ${biodrops.applicationNote}.
- ${organicOnly}
- Mix biofertilizers with Biodrops Bokashi compost before soil application. Apply in moist soil; irrigate after; avoid direct sunlight during application.
- Use exact product names and dosages from biodropsProductHints — do not substitute generic brands.
- Liquid biofertilizers (500 ml packs): typical drip rates are 1–2 L/acre when multiplying or using ready formulations.

biodropsProductHints:
${JSON.stringify(biodrops.productHints, null, 2)}
`;
}
