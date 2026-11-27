import { shouldGenerateAdvisory, ADVISORY_MAX_DAYS_BETWEEN } from "../utils/weather/weatherSnapshot.utils.js";
import { shouldGenerateBarrenLandAdvisory } from "../utils/agronomy/barrenLand/barrenLandScheduling.js";

const DAY = 86400000;
const daysAgo = (d) => new Date(Date.now() - d * DAY - 60_000); // a minute past the mark

describe("advisory refresh interval", () => {
  test("defaults to every 2 days", () => {
    expect(ADVISORY_MAX_DAYS_BETWEEN).toBe(2);
  });

  test("crop farm: no refresh before 2 days, refresh at 2 days", () => {
    const base = { gddDelta: 0, threshold: 50, currentSnapshot: null };
    expect(
      shouldGenerateAdvisory({ ...base, lastAdvisory: { createdAt: daysAgo(1.5) } }).generate,
    ).toBe(false);
    const due = shouldGenerateAdvisory({ ...base, lastAdvisory: { createdAt: daysAgo(2) } });
    expect(due.generate).toBe(true);
    expect(due.reason).toMatch(/^weekly_refresh_2d$/);
  });

  test("barren farm: no refresh before 2 days, refresh at 2 days", () => {
    const base = { expectedSowingDateISO: null, currentSnapshot: null };
    expect(
      shouldGenerateBarrenLandAdvisory({ ...base, lastAdvisory: { createdAt: daysAgo(1.5) } }).generate,
    ).toBe(false);
    expect(
      shouldGenerateBarrenLandAdvisory({ ...base, lastAdvisory: { createdAt: daysAgo(2) } }).generate,
    ).toBe(true);
  });
});
