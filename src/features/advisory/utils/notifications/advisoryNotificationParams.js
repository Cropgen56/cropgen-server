import { t, normalizeAdvisoryLanguage } from "../i18n/advisoryLocale.js";

const ACRE_TO_HA = 0.404686;

export function formatAreaForNotification(acre, platform = "whatsapp") {
  const value = Number(acre);
  if (!Number.isFinite(value) || value < 0) {
    return platform === "web" ? "0 ha" : "0 Acre";
  }
  if (platform === "web") {
    return `${(value * ACRE_TO_HA).toFixed(2)} ha`;
  }
  return `${(Math.round(value * 100) / 100).toFixed(2)} Acre`;
}

export const ADVISORY_ACTIVITY_TYPES = [
  "SPRAY",
  "FERTIGATION",
  "IRRIGATION",
  "WEATHER",
];

const DEFAULT_MESSAGES = {
  SPRAY: "No spray advisory.",
  FERTIGATION: "No fertigation advisory.",
  IRRIGATION: "No irrigation advisory.",
  WEATHER: "No weather update.",
  CROP_RISK: "No crop risk alert.",
  MONITORING: "No monitoring advice.",
  CARBON_TRACKING: "No carbon update.",
};

const DEFAULT_MESSAGE_KEYS = {
  SPRAY: "notif_default_spray",
  FERTIGATION: "notif_default_fertigation",
  IRRIGATION: "notif_default_irrigation",
  WEATHER: "notif_default_weather",
  CROP_RISK: "notif_default_crop_risk",
  MONITORING: "notif_default_monitoring",
  CARBON_TRACKING: "notif_default_carbon",
};

export function getDefaultActivityMessage(type, lang = "en") {
  const key = DEFAULT_MESSAGE_KEYS[type];
  return key ? t(key, normalizeAdvisoryLanguage(lang)) : DEFAULT_MESSAGES[type] || "No advisory update.";
}

const ACTIVITY_TYPE_LABEL_KEYS = {
  SPRAY: "title_spray",
  FERTIGATION: "title_fertigation",
  IRRIGATION: "title_irrigation",
  WEATHER: "title_weather_crop",
};

const WHATSAPP_TEMPLATE_PARAM_MAX_CHARS = 100;
const MIN_ACTIONABLE_MESSAGE_CHARS = 10;

function cleanText(v) {
  return String(v ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function truncateForTemplate(
  value,
  maxChars = WHATSAPP_TEMPLATE_PARAM_MAX_CHARS,
) {
  const text = cleanText(value);
  if (!text) return "";
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars).trim();
}

function formatActivityNotificationMessage(activity) {
  const message = cleanText(activity?.message);
  return truncateForTemplate(message);
}

export function formatActivityTypeLabel(type, lang = "en") {
  const key = ACTIVITY_TYPE_LABEL_KEYS[type];
  return key ? t(key, normalizeAdvisoryLanguage(lang)) : cleanText(type);
}

function formatDetailProducts(products) {
  if (!Array.isArray(products) || !products.length) return "";
  return products
    .map((p) => {
      if (typeof p === "string") return p;
      const name = p?.name || p?.productName || "";
      const dose = p?.dose || p?.quantity || "";
      return dose ? `${name} (${dose})` : name;
    })
    .filter(Boolean)
    .join("; ");
}

export function formatActivityDetails(activity, lang = "en") {
  const code = normalizeAdvisoryLanguage(lang);
  const label = (key, value) => `${t(key, code)}: ${cleanText(value)}`;
  const parts = [];
  const message = cleanText(activity?.message);
  if (message) parts.push(message);

  const details = activity?.details || {};
  const productText = formatDetailProducts(details.products);
  if (productText) parts.push(label("notif_label_products", productText));
  if (details.chemical) parts.push(label("notif_label_chemical", details.chemical));
  if (details.fertilizer) {
    parts.push(label("notif_label_fertilizer", details.fertilizer));
  }
  if (details.quantity) parts.push(label("notif_label_quantity", details.quantity));
  if (details.method || details.applicationMethod) {
    parts.push(
      label("notif_label_method", details.method || details.applicationMethod),
    );
  }
  if (details.duration) parts.push(label("notif_label_duration", details.duration));
  if (details.waterQuantity) {
    parts.push(label("notif_label_water", details.waterQuantity));
  }
  if (details.weather) parts.push(label("notif_label_weather", details.weather));
  if (details.risk) parts.push(label("notif_label_risk", details.risk));
  if (details.notes) parts.push(cleanText(details.notes));

  // Parts may already end in a full stop (any script); avoid "..".
  const rendered = truncateForTemplate(
    parts.map((part) => part.replace(/[.।॥۔᱾]+$/u, "")).join(". "),
  );
  return rendered || t("notif_no_details", code);
}

export function formatRecommendedTime(activity, lang = "en") {
  const details = activity?.details || {};
  const rendered = truncateForTemplate(details.timing || details.time || "");
  return rendered || t("notif_default_time", normalizeAdvisoryLanguage(lang));
}

export function isActionableActivity(activity) {
  if (!activity?.type) return false;

  const message = cleanText(activity.message);
  if (!message || message.length < MIN_ACTIONABLE_MESSAGE_CHARS) return false;

  const defaultMessage = DEFAULT_MESSAGES[activity.type];
  if (defaultMessage && message === defaultMessage) return false;

  const recommendedAction = cleanText(activity.details?.recommendedAction);
  if (
    recommendedAction &&
    /^(none|no action|not required)$/i.test(recommendedAction)
  ) {
    return false;
  }

  return true;
}

/**
 * Build WhatsApp template parameters for a single activity (advisory template).
 */
export function buildActivityAdvisoryParameters(user, farmField, activity) {
  const lang = normalizeAdvisoryLanguage(user?.language);
  const activityTypeLabel = truncateForTemplate(formatActivityTypeLabel(activity?.type, lang));
  const activityTitle = truncateForTemplate(activity?.title || "");
  const activityDetails = formatActivityDetails(activity, lang);
  const recommendedTime = formatRecommendedTime(activity, lang);

  return [
    truncateForTemplate(user?.firstName || "Farmer"),
    truncateForTemplate(farmField?.cropName || "Crop"),
    activityTypeLabel || "Advisory",
    activityTitle || `${activityTypeLabel || "Advisory"} Update`,
    activityDetails || t("notif_no_details", lang),
    recommendedTime || t("notif_default_time", lang),
    truncateForTemplate(farmField?.fieldName || "Field"),
  ];
}

/**
 * Build WhatsApp/email template parameters for farm_advisory.
 */
export function buildAdvisoryNotificationParameters(
  user,
  farmField,
  advisory,
  platform = "whatsapp",
) {
  const advisoryDateObj = advisory?.createdAt
    ? new Date(advisory.createdAt)
    : new Date();
  const advisoryDateStr = advisoryDateObj
    .toISOString()
    .slice(0, 10)
    .split("-")
    .reverse()
    .join("-");

  const typeToKey = {
    SPRAY: "spray",
    FERTIGATION: "fertigation",
    IRRIGATION: "irrigation",
    WEATHER: "weather",
    CROP_RISK: "cropRisk",
    MONITORING: "monitoring",
    CARBON_TRACKING: "carbonUpdate",
  };

  const lang = normalizeAdvisoryLanguage(user?.language);
  const defaults = Object.fromEntries(
    Object.keys(DEFAULT_MESSAGES).map((type) => [type, getDefaultActivityMessage(type, lang)]),
  );
  const mapped = {};
  for (const activity of advisory?.activitiesToDo || []) {
    const key = typeToKey[activity.type];
    if (key) {
      const formatted = formatActivityNotificationMessage(activity);
      if (formatted) mapped[key] = formatted;
    }
  }

  return [
    user.firstName || "Farmer",
    advisoryDateStr,
    farmField.cropName || "Crop",
    farmField.fieldName || "Field",
    formatAreaForNotification(farmField.acre, platform),
    mapped.spray ?? defaults.SPRAY,
    mapped.fertigation ?? defaults.FERTIGATION,
    mapped.irrigation ?? defaults.IRRIGATION,
    mapped.weather ?? defaults.WEATHER,
    mapped.cropRisk ?? defaults.CROP_RISK,
    mapped.monitoring ?? defaults.MONITORING,
    mapped.carbonUpdate ?? defaults.CARBON_TRACKING,
  ];
}
