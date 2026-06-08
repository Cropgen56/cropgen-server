function formatLocation(user) {
  const parts = [user.village, user.district, user.state, user.country].filter(
    Boolean,
  );
  return parts.length ? parts.join(", ") : "—";
}

function formatLastActive(date) {
  if (!date) return "—";
  const d = new Date(date);
  const now = Date.now();
  const diffMs = now - d.getTime();
  const days = Math.floor(diffMs / 86400000);
  if (days < 1) return "Today";
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

/** BIODROPS farmers do not use paid subscriptions — status reflects onboarding progress. */
export function deriveFarmerDisplayStatus({ fields = [] } = {}) {
  if (fields.length > 0) return "active";
  return "registered";
}

function formatField(field) {
  return {
    id: String(field._id),
    fieldName: field.fieldName || "—",
    cropName: field.cropName || "—",
    variety: field.variety || "—",
    acre: field.acre || 0,
    sowingDate: field.sowingDate || "—",
    typeOfIrrigation: field.typeOfIrrigation || "—",
    typeOfFarming: field.typeOfFarming || "—",
    isBarrenLand: Boolean(field.isBarrenLand),
    createdAt: field.createdAt || null,
    updatedAt: field.updatedAt || null,
  };
}

export function formatCrmFarmerDetail(user, { fields = [] } = {}) {
  const summary = formatCrmFarmer(user, { fields });
  const formattedFields = fields.map(formatField);
  const crops = [...new Set(fields.map((f) => f.cropName).filter(Boolean))];
  const irrigationTypes = [
    ...new Set(fields.map((f) => f.typeOfIrrigation).filter(Boolean)),
  ];

  return {
    ...summary,
    email: user.email || null,
    country: user.country || null,
    state: user.state || null,
    district: user.district || null,
    city: user.city || null,
    village: user.village || null,
    language: user.language || null,
    clientSource: user.clientSource || null,
    termsAccepted: user.terms === true,
    lastLoginAt: user.lastLoginAt || null,
    lastActiveAt: user.lastActiveAt || user.lastLoginAt || user.updatedAt || null,
    createdAt: user.createdAt || null,
    updatedAt: user.updatedAt || null,
    totalAcre: formattedFields.reduce((sum, field) => sum + (field.acre || 0), 0),
    crops,
    irrigationTypes,
    fields: formattedFields,
  };
}

export function formatCrmFarmer(user, { fields = [] } = {}) {
  const name =
    [user.firstName, user.lastName].filter(Boolean).join(" ").trim() ||
    user.phone ||
    "Farmer";

  const totalAcre = fields.reduce((sum, f) => sum + (f.acre || 0), 0);
  const primaryField = fields[0];
  const crops = [...new Set(fields.map((f) => f.cropName).filter(Boolean))];

  return {
    id: String(user._id),
    uid: `FR-${String(user._id).slice(-6).toUpperCase()}`,
    name,
    phone: user.phone || "—",
    email: user.email || null,
    avatar: user.avatar || null,
    location: formatLocation(user),
    landSize: totalAcre > 0 ? `${totalAcre.toFixed(1)} ac` : "—",
    fieldCount: fields.length,
    crop: crops.length ? crops.slice(0, 2).join(", ") : "—",
    status: deriveFarmerDisplayStatus({ fields }),
    lastAdvisory: formatLastActive(
      user.lastActiveAt || user.lastLoginAt || user.updatedAt,
    ),
    createdAt: user.createdAt,
  };
}
