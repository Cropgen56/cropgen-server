import { formatDateISO } from "../../shared/helpers.js";
import {
  hasSignificantWeatherChange,
  hasSevereWeatherAlert,
} from "../../weather/weatherSnapshot.utils.js";

export function daysUntilSowing(expectedSowingDateISO, today = new Date()) {
  const expected = new Date(expectedSowingDateISO);
  const now = new Date(formatDateISO(today));
  if (Number.isNaN(expected.getTime())) return null;
  return Math.ceil((expected - now) / 86400000);
}

/**
 * @returns {"planning"|"preparation"|"imminent"|"sowing_day"|"overdue"}
 */
export function getPreSowingPhase(daysUntil) {
  if (daysUntil == null) return "planning";
  if (daysUntil < 0) return "overdue";
  if (daysUntil === 0) return "sowing_day";
  if (daysUntil <= 7) return "imminent";
  if (daysUntil <= 30) return "preparation";
  return "planning";
}

function crossedPhaseBoundary(lastDays, currentDays) {
  if (lastDays == null || currentDays == null) return false;
  const boundaries = [30, 14, 7, 3, 1, 0];
  for (const b of boundaries) {
    if (lastDays > b && currentDays <= b) return true;
  }
  if (lastDays > 0 && currentDays < 0) return true;
  return false;
}

/**
 * Cron: when to refresh pre-sowing advisories (no GDD).
 */
export function shouldGenerateBarrenLandAdvisory({
  lastAdvisory,
  currentSnapshot,
  expectedSowingDateISO,
  maxDaysBetweenAdvisories = 7,
}) {
  if (!lastAdvisory) {
    return { generate: true, reason: "first_barren_advisory" };
  }

  const currentDays = daysUntilSowing(expectedSowingDateISO);
  const lastDays =
    lastAdvisory.plantGrowthActivity?.daysUntilSowing ??
    daysUntilSowing(
      lastAdvisory.plantGrowthActivity?.expectedSowingDate ||
        expectedSowingDateISO,
      lastAdvisory.createdAt,
    );

  if (crossedPhaseBoundary(lastDays, currentDays)) {
    return {
      generate: true,
      reason: `pre_sowing_phase_${lastDays}_to_${currentDays}d`,
    };
  }

  const lastCreated = lastAdvisory.createdAt
    ? new Date(lastAdvisory.createdAt)
    : null;
  if (lastCreated) {
    const daysSince = Math.floor(
      (Date.now() - lastCreated.getTime()) / 86400000,
    );
    if (daysSince >= maxDaysBetweenAdvisories) {
      return { generate: true, reason: `barren_refresh_${daysSince}d` };
    }
  }

  const lastSnapshot = lastAdvisory.weatherSnapshot;
  if (lastSnapshot && currentSnapshot) {
    const { changed, reasons } = hasSignificantWeatherChange(
      lastSnapshot,
      currentSnapshot,
    );
    if (changed) {
      return {
        generate: true,
        reason: `weather_change:${reasons.join(",")}`,
      };
    }
  } else if (hasSevereWeatherAlert(currentSnapshot)) {
    return { generate: true, reason: "severe_weather_no_baseline" };
  }

  return { generate: false, reason: "barren_unchanged" };
}
