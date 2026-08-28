/**
 * BioDrops acre-tiered SaaS packages (e.g. "Up to 10 Acre", "Up to 20 Acre").
 * Mirrors utils/subscription/aatPlan.js, but scoped to brand "biodrops" and
 * expressed in acres (maxAcres) instead of hectares (maxHectares).
 */

/** A tier plan is a BioDrops plan with an acre cap set — a flat package, not per-acre pricing. */
export function isBiodropsTierPlan(plan) {
  return (
    plan?.brand === "biodrops" &&
    Number.isFinite(Number(plan.maxAcres)) &&
    Number(plan.maxAcres) > 0
  );
}

/** Flat monthly/yearly package — do not multiply by field acres. */
export function biodropsTierChargeArea(plan, defaultArea) {
  return isBiodropsTierPlan(plan) ? 1 : defaultArea;
}

/**
 * Informational only — BioDrops tier caps are a soft warning, not a hard block.
 * @returns {string|null} warning message when the field exceeds the plan's cap
 */
export function biodropsTierCapWarning(plan, farmAcre) {
  if (!isBiodropsTierPlan(plan)) return null;
  const maxAcres = Number(plan.maxAcres);
  const fieldAcres = Number(farmAcre) || 0;
  if (fieldAcres > maxAcres + 0.05) {
    return `This field is ${fieldAcres.toFixed(2)} acre. The ${plan.name} plan covers up to ${maxAcres} acre.`;
  }
  return null;
}
