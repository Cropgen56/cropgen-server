import { getBiodropsRecommendations } from "../advisory/getBiodropsRecommendations.js";
import {
  BIODROPS_BOKASHI_PRODUCT,
  BIODROPS_PRODUCT_CATALOG,
} from "../data/precisionFarmingKit.js";
import { getCropTimelineStatus } from "../../../features/agent/utils/farmContext.js";

function estimateBbchStage(timeline) {
  if (timeline.label === "PRE_SOWING") return 0;
  const days = timeline.daysSinceSowing ?? 0;
  if (days < 25) return 15;
  if (days < 55) return 35;
  if (days < 85) return 65;
  return 90;
}

function buildCatalogLines() {
  return Object.values(BIODROPS_PRODUCT_CATALOG).map(
    (p) =>
      `• ${p.productName}: ${p.tagline}. How to apply: ${p.defaultMethod}.`,
  );
}

/**
 * Biodrops product guidance for Satagro AI chat (logged-in farmers).
 * @param {object[]} farms — FarmField lean docs
 * @param {{ today?: Date }} [options]
 */
export function buildBiodropsAgentProductBlock(farms = [], options = {}) {
  const today = options.today ?? new Date();
  const catalog = buildCatalogLines().join("\n");

  function pushRecommendationLine(fieldName, cropName, sowingDate, typeOfFarming, acre) {
    const timeline = getCropTimelineStatus(sowingDate, today);
    const mode = timeline.label === "PRE_SOWING" ? "barren" : "crop";
    const rec = getBiodropsRecommendations({
      cropName,
      // Multi-crop: no per-crop area breakdown exists (acre is farm-level,
      // shared across crops) — same farm-total acreage used for every
      // crop's dosage line, matching pre-multi-crop behavior.
      acre,
      bbchStage: estimateBbchStage(timeline),
      typeOfFarming: typeOfFarming || "Integrated",
      mode,
    });

    const hints = rec.productHints
      .map(
        (h) =>
          `${h.productName} — ${h.dosage}; ${h.method}${h.priority === "high" ? " (priority)" : ""}`,
      )
      .join(" | ");

    if (hints) {
      perFarm.push(
        `"${fieldName}" (${rec.cropLabel}, ${cropName}, ${typeOfFarming || "Integrated"}): ${hints}`,
      );
    }
  }

  const perFarm = [];
  for (const f of farms) {
    // Multi-crop: one recommendation line per active crop on the farm,
    // sharing the farm's own typeOfFarming. Falls back to the farm's legacy
    // singular crop when `.crops` wasn't attached by the caller.
    if (Array.isArray(f.crops) && f.crops.length > 0) {
      for (const crop of f.crops) {
        pushRecommendationLine(f.fieldName, crop.cropName, crop.startDate, f.typeOfFarming, f.acre);
      }
    } else if (!Array.isArray(f.crops)) {
      pushRecommendationLine(f.fieldName, f.cropName, f.sowingDate, f.typeOfFarming, f.acre);
    }
    // f.crops === [] (attached but empty, i.e. genuinely barren): no line.
  }

  const farmDoseBlock = perFarm.length
    ? `\n=== THIS USER — CROP-WISE BIODROPS DOSES (scale to their registered acreage) ===\n${perFarm.join("\n")}\n`
    : "";

  return `
=== BIODROPS PRECISION FARMING PRODUCTS (Satagro / Biodrops users) ===
When the farmer asks for suggestions, recommendations, what to apply, products, fertilizer plan, organic inputs, soil treatment, pest/disease control, or "what should I use" — you MUST include practical farm advice AND a short Biodrops products section.

Product catalog (use exact names):
${catalog}
• ${BIODROPS_BOKASHI_PRODUCT.productName}: ${BIODROPS_BOKASHI_PRODUCT.description}

=== HOW TO SUGGEST PRODUCTS ===
• Lead with 1–3 field actions (what to do this week), then add a labeled block: "Biodrops products:" with 2–4 items.
• ALWAYS include Biodrops Bokashi Compost when recommending soil-applied biofertilizers — mix biofertilizers with Bokashi in moist soil, then apply; irrigate lightly after.
• Match products to their crop stage and farming type from registered farms.
• Organic farming: recommend ONLY Biodrops bio-inputs + Bokashi — no chemical NPK or synthetic pesticides.
• Integrated farming: prefer Biodrops bio-inputs first; mention chemical NPK only if severe deficiency and farmer already uses inorganic practices.
• Give dosages from the per-farm hints below when available; scale per-acre rates to their field acreage.
• Do NOT push products on pure weather, app, or account questions unless they ask about inputs or treatment.
• If they have multiple farms, suggest products for the farm they are discussing or list per farm briefly.
${farmDoseBlock}`;
}
