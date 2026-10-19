const ACRES_PER_HECTARE = 2.4710538147;

export function acresToHectares(acres) {
  return Number(acres || 0) / ACRES_PER_HECTARE;
}

/**
 * AAT SaaS plans are hectare-capped packages. CropGen/Biodrops ignore this.
 * @returns {string|null} error message when the field is too large
 */
export function assertAatFieldWithinPlan(plan, farmAcre) {
  if (!plan || plan.brand !== "aat") return null;
  const maxHa = Number(plan.maxHectares);
  if (!Number.isFinite(maxHa) || maxHa <= 0) return null;
  const fieldHa = acresToHectares(farmAcre);
  if (fieldHa > maxHa + 0.05) {
    return `This field is ${fieldHa.toFixed(2)} ha. The ${plan.name} plan covers up to ${maxHa} ha. Choose a higher AAT plan.`;
  }
  return null;
}

/** Flat monthly/yearly package — do not multiply by field acres. */
export function aatChargeArea(planBrand, defaultArea) {
  return planBrand === "aat" ? 1 : defaultArea;
}

/**
 * CropGen and Biodrops: any active subscription can generate advisory.
 * AAT Starter has monitoring only; Growth+ enables AI Advisory (smartAdvisorySystem).
 */
export function planAllowsScheduledAdvisory(plan) {
  if (!plan || plan.brand !== "aat") return true;
  return Boolean(plan.features?.smartAdvisorySystem);
}
