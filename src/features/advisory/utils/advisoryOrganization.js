import { isBiodropsOrganizationCode } from "../../../utils/organization/biodropsOrganization.js";

export const ADVISORY_NOTIFICATION_ORG_CODE = "CROPGEN";

/**
 * WhatsApp/email advisory delivery goes to every CropGen-app org (CROPGEN,
 * AAT, …). BioDrops is excluded: its template notifications are disabled,
 * same as the reminder and welcome workers.
 */
export function receivesAdvisoryNotifications(code) {
  return !isBiodropsOrganizationCode(String(code || "").trim());
}

/**
 * User IDs eligible for CROPGEN email/WhatsApp advisory delivery.
 * Includes users with no organization (legacy defaults to CROPGEN).
 * Scheduled advisory generation itself runs for every org's subscribed farms.
 */
export async function getCropgenOrganizationUserIds(User, resolveOrganizationByCode) {
  const { org } = await resolveOrganizationByCode(ADVISORY_NOTIFICATION_ORG_CODE);
  const users = await User.find({
    $or: [{ organization: org._id }, { organization: null }],
  })
    .select("_id")
    .lean();

  return users.map((u) => u._id);
}
