/**
 * Monitoring Decision Engine
 * Zone-specific when stress detected; generic checks otherwise.
 */

/**
 * Get monitoring recommendation from evidence.
 * @param {Object} evidence - Structured evidence (includes stressZones)
 * @returns {Object} { hint: Object }
 */
export function getMonitoringDecision(evidence) {
  const stressZones = evidence?.stressZones ?? [];

  if (stressZones.length > 0) {
    const zoneDesc = stressZones
      .map((z) => (z.direction ? `${z.zone} (${z.direction})` : z.zone))
      .join(", ");
    return {
      hint: {
        zone: zoneDesc,
        message: `Stress detected in ${zoneDesc}. Inspect leaves in that area for yellowing or pest damage.`,
        checks: "leaves, pest damage, irrigation",
      },
    };
  }

  return {
    hint: {
      zone: "field",
      message: "Check lower leaves, stem base, and new growth.",
      checks: "lower leaves, stem base, new growth",
    },
  };
}
