// Safe MongoDB filters for email campaign user segments
const ALLOWED_USER_FIELDS = new Set([
  "email",
  "role",
  "state",
  "district",
  "isActive",
  "unsubscribed",
  "createdAt",
]);

export function buildSafeUserFilter(segment) {
  if (!segment || typeof segment !== "object")
    return {
      // ensure we only target users with a non-empty email
      email: { $exists: true, $type: "string", $ne: "" },
      unsubscribed: { $ne: true },
      // isActive: true, // <- uncomment if you want only active users
    };

  const src = segment.filters || segment;
  const out = {};
  for (const [key, val] of Object.entries(src)) {
    if (!ALLOWED_USER_FIELDS.has(key)) continue;
    out[key] = val;
  }

  // enforce valid email presence always
  out.email = { $exists: true, $type: "string", $ne: "" };

  // Always exclude unsubscribed if not explicitly set
  if (out.unsubscribed === undefined) out.unsubscribed = { $ne: true };

  // Optionally filter active users
  // if (out.isActive === undefined) out.isActive = true;

  return out;
}
