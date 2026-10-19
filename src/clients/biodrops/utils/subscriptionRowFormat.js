function formatInr(minor) {
  const amount = Number(minor) || 0;
  return `₹${(amount / 100).toLocaleString("en-IN", {
    maximumFractionDigits: 0,
  })}`;
}

function formatDate(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function farmerName(user) {
  if (!user) return "Farmer";
  const name = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  return name || user.phone || "Farmer";
}

function farmerLocation(user) {
  if (!user) return "—";
  const parts = [user.village, user.district, user.state].filter(Boolean);
  return parts.length ? parts.join(", ") : "—";
}

export function resolveExpiryDate(sub) {
  return sub.endDate || sub.currentPeriodEnd || sub.trialEndsAt || null;
}

export function formatCrmSubscriptionRow(sub) {
  const user = sub.userId;
  const field = sub.fieldId;
  const plan = sub.planId;
  const expiry = resolveExpiryDate(sub);

  return {
    id: String(sub._id),
    farmer: {
      id: user?._id ? String(user._id) : null,
      name: farmerName(user),
      phone: user?.phone || "—",
      avatar: user?.avatar || null,
      location: farmerLocation(user),
    },
    field: {
      id: field?._id ? String(field._id) : null,
      name: field?.fieldName || "—",
      acres: Number(field?.acre) || 0,
    },
    plan: {
      id: plan?._id ? String(plan._id) : null,
      name: plan?.name || "—",
      slug: plan?.slug || "",
      isInternal: Boolean(plan?.isInternal),
    },
    billingCycle: sub.billingCycle,
    billingLabel:
      sub.billingCycle === "trial"
        ? "Trial"
        : String(sub.billingCycle || "—").replace(/^./, (c) => c.toUpperCase()),
    amount: formatInr(sub.totalAmountMinor),
    amountMinor: Number(sub.totalAmountMinor) || 0,
    currency: sub.chargedCurrency || sub.displayCurrency || "INR",
    status: sub.status,
    activationSource: sub.activationSource || "razorpay",
    activatedByAdmin: Boolean(sub.activatedByAdmin),
    cardAcres: Number(sub.cardAcres) || 0,
    paidAcres: Number(sub.paidAcres) || 0,
    pendingAdminAcres: Number(sub.pendingAdminAcres) || 0,
    subscriptionPhase: sub.subscriptionPhase || null,
    acres: Number(sub.area) || 0,
    startDate: formatDate(sub.startDate),
    endDate: formatDate(expiry),
    razorpaySubscriptionId: sub.razorpaySubscriptionId || null,
    razorpayPaymentId: sub.razorpayPaymentId || null,
    createdAt: formatDate(sub.createdAt),
  };
}
