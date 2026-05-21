const REQUIRED_TYPES = [
  "SPRAY",
  "FERTIGATION",
  "IRRIGATION",
  "WEATHER",
  "CROP_RISK",
  "MONITORING",
  "CARBON_TRACKING",
];

const WHATSAPP_MAX = 220;

function truncate(text, max = WHATSAPP_MAX) {
  if (!text || typeof text !== "string") return text || "";
  const trimmed = text.trim();
  return trimmed.length <= max ? trimmed : `${trimmed.slice(0, max - 3)}...`;
}

/**
 * Light validation only — do NOT replace LLM text with rule-based English/Hindi strings.
 * Language consistency is owned by the LLM prompt in generateSmartAdvisory.
 */
export function postProcessAdvisory(llmOutput, evidence) {
  const activities = llmOutput?.activitiesToDo ?? [];
  const activityMap = new Map();
  activities.forEach((a) => {
    if (a?.type) activityMap.set(a.type, a);
  });

  REQUIRED_TYPES.forEach((type) => {
    if (!activityMap.has(type)) {
      activityMap.set(type, { type, title: type, message: "", details: {} });
    } else {
      const act = activityMap.get(type);
      activityMap.set(type, {
        ...act,
        title: typeof act.title === "string" ? act.title : type,
        message: truncate(act.message),
        details: act.details && typeof act.details === "object" ? act.details : {},
      });
    }
  });

  return { activitiesToDo: REQUIRED_TYPES.map((type) => activityMap.get(type)) };
}
