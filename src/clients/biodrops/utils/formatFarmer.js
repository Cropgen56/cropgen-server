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

export function deriveFarmerDisplayStatus(subscription) {
  if (!subscription) return "trial";
  if (subscription.status === "active") {
    if (subscription.endDate) {
      const daysLeft =
        (new Date(subscription.endDate).getTime() - Date.now()) / 86400000;
      if (daysLeft > 0 && daysLeft <= 14) return "expiring";
    }
    return "active";
  }
  if (subscription.status === "expired") return "expired";
  if (subscription.billingCycle === "trial") return "trial";
  return "trial";
}

export function formatCrmFarmer(user, { fields = [], subscription = null } = {}) {
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
    status: deriveFarmerDisplayStatus(subscription),
    lastAdvisory: formatLastActive(
      user.lastActiveAt || user.lastLoginAt || user.updatedAt,
    ),
    createdAt: user.createdAt,
  };
}
