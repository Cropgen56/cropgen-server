export const ADVISORY_NOTIFICATION_ORG_CODE = "CROPGEN";

export function isCropgenOrganizationCode(code) {
  const normalized = String(code || ADVISORY_NOTIFICATION_ORG_CODE)
    .toUpperCase()
    .trim();
  return normalized === ADVISORY_NOTIFICATION_ORG_CODE;
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
