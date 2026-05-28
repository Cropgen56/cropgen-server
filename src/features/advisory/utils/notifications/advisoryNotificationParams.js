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

const DEFAULT_MESSAGES = {
  SPRAY: "No spray advisory.",
  FERTIGATION: "No fertigation advisory.",
  IRRIGATION: "No irrigation advisory.",
  WEATHER: "No weather update.",
  CROP_RISK: "No crop risk alert.",
  MONITORING: "No monitoring advice.",
  CARBON_TRACKING: "No carbon update.",
};
const WHATSAPP_TEMPLATE_PARAM_MAX_CHARS = 100;

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
