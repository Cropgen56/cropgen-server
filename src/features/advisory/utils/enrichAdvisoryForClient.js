import { isMaturityOrHarvestStage } from "../pipeline/advisoryContext.js";
import { normalizeCropName } from "../../../utils/npk/npkCalculator.js";
import { CROP_PROFILES } from "../../../utils/npk/cropProfiles.js";
import { acresToHectares } from "../../../utils/npk/npkArea.js";
import { t, normalizeAdvisoryLanguage } from "./i18n/advisoryLocale.js";

const NUTRIENT_FIELDS = [
  { symbol: "N", labelKey: "npk_ui_nitrogen", field: "nitrogenKgPerHa" },
  { symbol: "P", labelKey: "npk_ui_phosphorous", field: "phosphorousKgPerHa" },
  { symbol: "K", labelKey: "npk_ui_potassium", field: "potassiumKgPerHa" },
];

const FALLBACK_LABELS = { N: "Nitrogen", P: "Phosphorous", K: "Potassium" };

function resolveFarmField(advisory) {
  if (advisory?.farmField && typeof advisory.farmField === "object") {
    return advisory.farmField;
  }
  const ff = advisory?.farmFieldId;
  if (ff && typeof ff === "object" && (ff.cropName || ff.fieldName)) {
    return ff;
  }
  return null;
}

/** Harvest stage from advisory growth data + crop maturity profile (aligned with NPK calculator). */
export function isCropAtHarvestStage(plantGrowthActivity, farmField) {
  const bbch = Number(plantGrowthActivity?.bbchStage);
  if (farmField?.cropName) {
    const crop = CROP_PROFILES[normalizeCropName(farmField.cropName)];
    if (
      crop?.maturityBBCH != null &&
      Number.isFinite(bbch) &&
      bbch >= crop.maturityBBCH
    ) {
      return true;
    }
  }
  return isMaturityOrHarvestStage(plantGrowthActivity);
}

function allNpkZero(npkManagement) {
  const avail = npkManagement?.available ?? {};
  const req = npkManagement?.required ?? {};
  const keys = ["nitrogenKgPerHa", "phosphorousKgPerHa", "potassiumKgPerHa"];
  return keys.every(
    (k) => (Number(avail[k]) || 0) === 0 && (Number(req[k]) || 0) === 0,
  );
}

function buildGrowthStageLabel(plantGrowthActivity) {
  if (!plantGrowthActivity?.stageName) return null;
  const bbch = plantGrowthActivity.bbchStage;
  const bbchPart =
    bbch != null && Number.isFinite(Number(bbch)) ? ` (BBCH ${bbch})` : "";
  return `${plantGrowthActivity.stageName}${bbchPart}`;
}

function nutrientLabel(labelKey, lang, symbol) {
  const translated = t(labelKey, lang);
  return translated !== labelKey ? translated : FALLBACK_LABELS[symbol];
}

function formatKg(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round(n * 10) / 10;
}

function resolveFieldHectare(npkManagement, farmField) {
  const fromNpk = Number(npkManagement?.area?.hectare);
  if (Number.isFinite(fromNpk) && fromNpk > 0) return fromNpk;
  const acre = Number(farmField?.acre);
  if (Number.isFinite(acre) && acre > 0) return acresToHectares(acre);
  return null;
}

function buildApplySummary(nutrients, lang) {
  const items = nutrients
    .filter((n) => n.deficitPerHa > 0 && n.applyKg > 0)
    .map((n) =>
      t("npk_ui_apply_item", lang, {
        amount: n.applyKg,
        nutrient: n.label,
      }),
    );
  if (!items.length) return null;
  return t("npk_ui_apply_summary", lang, { items: items.join(", ") });
}

function buildNpkDisplay(npkManagement, plantGrowthActivity, farmField, language) {
  const lang = normalizeAdvisoryLanguage(language);
  const isHarvestStage = isCropAtHarvestStage(plantGrowthActivity, farmField);
  const allZero = allNpkZero(npkManagement);
  const cropName = farmField?.cropName || "Crop";
  const variety = farmField?.variety || "";
  const varietySuffix = variety ? ` (${variety})` : "";
  const cropAgeDays =
    plantGrowthActivity?.cropAgeDays != null
      ? Number(plantGrowthActivity.cropAgeDays)
      : null;

  let view = "chart";
  if (allZero) {
    view = "zero_baseline";
  } else if (isHarvestStage) {
    view = "harvest_banner";
  }

  const growthStageLabel = buildGrowthStageLabel(plantGrowthActivity);
  const avail = npkManagement?.available ?? {};
  const req = npkManagement?.required ?? {};
  const deficitRaw = npkManagement?.deficit ?? {};
  const fieldHectare = resolveFieldHectare(npkManagement, farmField);
  const fieldAcre = Number(npkManagement?.area?.acre ?? farmField?.acre) || null;

  const nutrients = NUTRIENT_FIELDS.map(({ symbol, labelKey, field }) => {
    const label = nutrientLabel(labelKey, lang, symbol);
    const deficitPerHa = formatKg(deficitRaw[field]);
    const applyKg =
      fieldHectare != null && deficitPerHa > 0
        ? formatKg(deficitPerHa * fieldHectare)
        : 0;

    let applyMessage = null;
    if (deficitPerHa > 0) {
      applyMessage =
        applyKg > 0
          ? t("npk_ui_apply_field", lang, { amount: applyKg, nutrient: label })
          : t("npk_ui_apply_rate", lang, {
              amount: deficitPerHa,
              nutrient: label,
            });
    }

    return {
      symbol,
      label,
      current: Math.round(Number(avail[field]) || 0),
      required: Math.round(Number(req[field]) || 0),
      deficitPerHa,
      applyKg,
      applyMessage,
      deficitLabel:
        deficitPerHa > 0
          ? t("npk_ui_deficit_value", lang, { amount: deficitPerHa })
          : null,
    };
  });

  const applySummary = buildApplySummary(nutrients, lang);

  const display = {
    view,
    isHarvestStage,
    unit: "kg/ha",
    growthStageLabel,
    growthStageSubtitle:
      cropAgeDays != null && Number.isFinite(cropAgeDays)
        ? t("npk_ui_growth_subtitle", lang, { cropAgeDays })
        : null,
    bannerTitle: null,
    bannerDescription: null,
    statusCards: null,
    legend: null,
    nutrients: view === "chart" ? nutrients : null,
    applySummary: view === "chart" ? applySummary : null,
    fieldAcre,
    recommendationFallback: t("npk_ui_recommendation_fallback", lang),
  };

  if (view === "zero_baseline") {
    display.bannerTitle = isHarvestStage
      ? t("npk_ui_zero_harvest_title", lang, { cropName, varietySuffix })
      : t("npk_ui_zero_baseline_title", lang, { cropName, varietySuffix });
    display.bannerDescription = t("npk_ui_zero_baseline_body", lang);
    display.statusCards = [
      {
        key: "status",
        title: t("npk_ui_card_status", lang),
        body: t("npk_ui_card_status_body", lang),
      },
      {
        key: "next",
        title: t("npk_ui_card_next", lang),
        body: t("npk_ui_card_next_body", lang),
      },
      {
        key: "planning",
        title: t("npk_ui_card_planning", lang),
        body: t("npk_ui_card_planning_body", lang),
      },
    ];
  } else if (view === "harvest_banner") {
    display.bannerTitle = t("npk_ui_harvest_banner_title", lang, {
      cropName,
      varietySuffix,
    });
  } else {
    display.legend = {
      current: t("npk_ui_legend_current", lang),
      required: t("npk_ui_legend_required", lang),
      deficit: t("npk_ui_legend_deficit", lang),
    };
  }

  return { ...npkManagement, display };
}

/**
 * Attach client-ready NPK display and crop stage metadata to an advisory document.
 * Safe to call on lean Mongoose docs and on records already enriched.
 */
export function enrichAdvisoryForClient(advisory, options = {}) {
  if (!advisory || typeof advisory !== "object") return advisory;

  const language = options.language || "en";
  const farmField = options.farmField ?? resolveFarmField(advisory);
  const plantGrowthActivity = advisory.plantGrowthActivity ?? null;
  const isHarvestStage = isCropAtHarvestStage(plantGrowthActivity, farmField);

  const npkManagement = advisory.npkManagement
    ? buildNpkDisplay(
        advisory.npkManagement,
        plantGrowthActivity,
        farmField,
        language,
      )
    : advisory.npkManagement;

  const enrichedPlantGrowth = plantGrowthActivity
    ? { ...plantGrowthActivity, isHarvestStage }
    : plantGrowthActivity;

  return {
    ...advisory,
    plantGrowthActivity: enrichedPlantGrowth,
    npkManagement,
    cropStage: {
      isHarvestStage,
      bbchStage: plantGrowthActivity?.bbchStage ?? null,
      stageName: plantGrowthActivity?.stageName ?? null,
      cropAgeDays: plantGrowthActivity?.cropAgeDays ?? null,
      label: buildGrowthStageLabel(plantGrowthActivity),
    },
  };
}

export function enrichAdvisoriesForClient(advisories, options = {}) {
  if (!Array.isArray(advisories)) return advisories;
  return advisories.map((advisory) => enrichAdvisoryForClient(advisory, options));
}
