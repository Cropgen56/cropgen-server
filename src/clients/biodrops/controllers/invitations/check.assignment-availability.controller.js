import { resolveBiodropsTenantId } from "../../utils/authPayload.js";
import { checkAssignmentAvailability } from "../../utils/assignmentAvailability.js";
import { canCreateAssignment } from "../../utils/adminScope.js";

export const checkCrmAssignmentAvailability = async (req, res) => {
  try {
    const { level, countryCode, stateCode, districtCode, excludeUserId } =
      req.query || {};
    const tenantId = await resolveBiodropsTenantId();

    const geoCountry = level === "super" ? null : countryCode || null;
    const geoState =
      level === "super" || level === "country" ? null : stateCode || null;
    const geoDistrict =
      level === "super" || level === "country" || level === "state"
        ? null
        : districtCode || null;

    const assignmentShape = {
      level,
      tenantId: String(tenantId),
      countryCode: geoCountry,
      stateCode: geoState,
      districtCode: geoDistrict,
      managedOrganizationId: null,
    };

    const canCreate = canCreateAssignment(req.adminActor, assignmentShape);

    const result = await checkAssignmentAvailability({
      level,
      tenantId,
      countryCode: geoCountry,
      stateCode: geoState,
      districtCode: geoDistrict,
      excludeUserId: excludeUserId || null,
    });

    const canAssign = Boolean(result.canAssign && canCreate);
    let message = result.message;
    if (!canCreate) {
      message =
        "You do not have permission to assign this admin level in the selected region.";
    }

    return res.status(200).json({
      success: true,
      ...result,
      canCreate,
      canAssign,
      message,
    });
  } catch (err) {
    console.error("checkCrmAssignmentAvailability:", err);
    return res.status(err.status || 500).json({
      success: false,
      available: false,
      canAssign: false,
      message: err.message || "Failed to check assignment availability.",
    });
  }
};
