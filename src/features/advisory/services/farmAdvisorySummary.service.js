/**
 * Combines several crops' latest FarmAdvisory docs (same farm, one per
 * active crop) into a single farm-level rollup. Computed on read, never
 * persisted — so it's always derived fresh from the underlying per-crop
 * advisories instead of risking staleness.
 */
export function buildFarmAdvisorySummary(cropAdvisoryEntries) {
  const entries = (cropAdvisoryEntries || []).filter((e) => e?.advisory);
  if (!entries.length) {
    return null;
  }

  const activitiesToDo = entries.flatMap((e) =>
    (e.advisory.activitiesToDo || []).map((activity) => ({
      ...activity,
      cropInstanceId: e.cropInstanceId,
      cropName: e.cropName,
    })),
  );

  const severity = { HIGH: 3, MEDIUM: 2, LOW: 1 };
  const highestPriorityFirst = [...activitiesToDo].sort(
    (a, b) => (severity[b.details?.priority] || 0) - (severity[a.details?.priority] || 0),
  );

  const cropHealthByCrop = entries.map((e) => ({
    cropInstanceId: e.cropInstanceId,
    cropName: e.cropName,
    cropHealth: e.advisory.cropHealth || null,
    stage: e.advisory.plantGrowthActivity?.stageName || null,
  }));

  const healthScores = entries
    .map((e) => e.advisory.cropHealth?.percentage)
    .filter((v) => typeof v === "number");
  const averageCropHealthPercentage = healthScores.length
    ? Math.round(healthScores.reduce((s, v) => s + v, 0) / healthScores.length)
    : null;

  return {
    cropCount: entries.length,
    crops: cropHealthByCrop,
    averageCropHealthPercentage,
    totalPendingActivities: activitiesToDo.filter((a) => a.progress !== "completed").length,
    topPriorityActivities: highestPriorityFirst.slice(0, 5),
    generatedAt: new Date().toISOString(),
  };
}
