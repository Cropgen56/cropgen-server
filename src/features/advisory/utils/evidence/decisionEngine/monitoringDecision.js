export function getMonitoringDecision(evidence) {
  const stressBlock = evidence?.stressZones;
  const zones = Array.isArray(stressBlock?.zones)
    ? stressBlock.zones
    : Array.isArray(stressBlock)
      ? stressBlock
      : [];

  if (zones.length > 0) {
    const zoneDesc = zones
      .map((z) => (z.direction ? `${z.zone} (${z.direction})` : z.zone))
      .join(", ");
    return {
      hint: {
        zone: zoneDesc,
        message: `Stress detected in ${zoneDesc}. Inspect leaves in that area for yellowing, wilting, or pest damage.`,
        checks: "leaves, pest damage, irrigation, nutrient deficiency",
      },
    };
  }

  const diseasePressure = stressBlock?.diseasePressure;
  if (diseasePressure === "high" || diseasePressure === "moderate") {
    return {
      hint: {
        zone: "field",
        message: `${diseasePressure === "high" ? "High" : "Moderate"} pest/disease pressure expected. Scout lower canopy and new growth.`,
        checks: "lower leaves, pests, fungal spots, irrigation",
      },
    };
  }

  return {
    hint: {
      zone: "field",
      message: "Check lower leaves, stem base, and new growth for early stress.",
      checks: "lower leaves, stem base, new growth, soil moisture",
    },
  };
}
