import { ORGANIZATION_CODE as BIODROPS_ORGANIZATION_CODE } from "../../clients/biodrops/constants.js";

export { BIODROPS_ORGANIZATION_CODE };

export function isBiodropsOrganizationCode(code) {
  return String(code || "").toUpperCase() === BIODROPS_ORGANIZATION_CODE;
}

/**
 * True when the user belongs to the Biodrops tenant.
 * OTP auth uses a separate WhatsApp sender; template notifications are disabled.
 */
export function isBiodropsUser(user) {
  if (!user) return false;
  const code =
    user.organization?.organizationCode ??
    user.organizationCode ??
    user.organization?.code;
  return isBiodropsOrganizationCode(code);
}
