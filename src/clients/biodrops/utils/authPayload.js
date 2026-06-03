import BiodropsAdminAssignment from "../models/admin-assignment.model.js";
import { ORGANIZATION_CODE } from "../constants.js";
import { serializeAssignment, isBiodropsOrganizationCode } from "./adminScope.js";
import { resolveOrganizationByCode } from "../../../utils/auth/authUtils.js";

export async function loadBiodropsAssignmentsForUser(userId) {
  const rows = await BiodropsAdminAssignment.find({
    userId,
    status: "active",
  })
    .select(
      "level tenantId countryCode stateCode districtCode managedOrganizationId",
    )
    .lean();

  return rows.map(serializeAssignment);
}

export function userBelongsToBiodrops(user) {
  const code =
    user?.organization?.organizationCode ||
    user?.organizationCode ||
    null;
  return isBiodropsOrganizationCode(code);
}

/**
 * Adds adminAssignments to a base JWT payload when the user is a BioDrops user.
 */
export async function enrichBiodropsAuthPayload(basePayload, user) {
  if (
    user?.populate &&
    user.organization &&
    user.organization.organizationCode == null
  ) {
    await user.populate("organization", "organizationCode");
  }

  const orgCode = user.organization?.organizationCode;
  if (!isBiodropsOrganizationCode(orgCode)) {
    return { ...basePayload, adminAssignments: [] };
  }

  const userId = basePayload.id || user._id;
  const adminAssignments = await loadBiodropsAssignmentsForUser(userId);

  return { ...basePayload, adminAssignments };
}

export async function buildBiodropsAuthTokenPayload(user) {
  const base = {
    id: user._id || user.id,
    role: user.role,
    organization: user.organization?._id || user.organization || null,
  };
  return enrichBiodropsAuthPayload(base, user);
}

export async function resolveBiodropsTenantId() {
  const { org } = await resolveOrganizationByCode(ORGANIZATION_CODE);
  return org._id;
}
