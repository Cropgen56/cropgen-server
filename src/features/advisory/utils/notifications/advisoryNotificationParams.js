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

export function getDefaultActivityMessage(type) {
  return DEFAULT_MESSAGES[type] || "No advisory update.";
}

const ACTIVITY_TYPE_LABELS = {
  SPRAY: "Spray",
  FERTIGATION: "Fertigation",
  IRRIGATION: "Irrigation",
  WEATHER: "Weather",
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

export function formatActivityTypeLabel(type) {
  return ACTIVITY_TYPE_LABELS[type] || cleanText(type);
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

export function formatActivityDetails(activity) {
  const parts = [];
  const message = cleanText(activity?.message);
  if (message) parts.push(message);

  const details = activity?.details || {};
  const productText = formatDetailProducts(details.products);
  if (productText) parts.push(`Products: ${productText}`);
  if (details.chemical) parts.push(`Chemical: ${cleanText(details.chemical)}`);
  if (details.fertilizer) {
    parts.push(`Fertilizer: ${cleanText(details.fertilizer)}`);
  }
  if (details.quantity) parts.push(`Quantity: ${cleanText(details.quantity)}`);
  if (details.method || details.applicationMethod) {
    parts.push(
      `Method: ${cleanText(details.method || details.applicationMethod)}`,
    );
  }
  if (details.duration) parts.push(`Duration: ${cleanText(details.duration)}`);
  if (details.waterQuantity) {
    parts.push(`Water: ${cleanText(details.waterQuantity)}`);
  }
  if (details.weather) parts.push(`Weather: ${cleanText(details.weather)}`);
  if (details.risk) parts.push(`Risk: ${cleanText(details.risk)}`);
  if (details.notes) parts.push(cleanText(details.notes));

  const rendered = truncateForTemplate(parts.join(". "));
  return rendered || "No additional details.";
}

export function formatRecommendedTime(activity) {
  const details = activity?.details || {};
  const rendered = truncateForTemplate(details.timing || details.time || "");
  return rendered || "As per current advisory window.";
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
  const activityTypeLabel = truncateForTemplate(formatActivityTypeLabel(activity?.type));
  const activityTitle = truncateForTemplate(activity?.title || "");
  const activityDetails = formatActivityDetails(activity);
  const recommendedTime = formatRecommendedTime(activity);

  return [
    truncateForTemplate(user?.firstName || "Farmer"),
    truncateForTemplate(farmField?.cropName || "Crop"),
    activityTypeLabel || "Advisory",
    activityTitle || `${activityTypeLabel || "Advisory"} Update`,
    activityDetails || "No additional details.",
    recommendedTime || "As per current advisory window.",
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

  const mapped = { ...DEFAULT_MESSAGES };
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
    mapped.spray ?? DEFAULT_MESSAGES.SPRAY,
    mapped.fertigation ?? DEFAULT_MESSAGES.FERTIGATION,
    mapped.irrigation ?? DEFAULT_MESSAGES.IRRIGATION,
    mapped.weather ?? DEFAULT_MESSAGES.WEATHER,
    mapped.cropRisk ?? DEFAULT_MESSAGES.CROP_RISK,
    mapped.monitoring ?? DEFAULT_MESSAGES.MONITORING,
    mapped.carbonUpdate ?? DEFAULT_MESSAGES.CARBON_TRACKING,
  ];
}
