import Organization from "../../../../models/organization.model.js";

/**
 * Automatic barren-land advisories are generated only for BIODROPS users.
 * Crop-in-field advisories are generated for every organization.
 * `user.organization` may be populated (object with organizationCode) or an id.
 */
export async function barrenAdvisoryAllowed(user) {
  if (!user || !user.organization) return false;
  let code = user.organization.organizationCode;
  if (code === undefined) {
    const org = await Organization.findById(user.organization)
      .select("organizationCode")
      .lean();
    code = org?.organizationCode;
  }
  return String(code || "").toUpperCase() === "BIODROPS";
}
