import { jest } from "@jest/globals";

const getMock = jest.fn();

jest.unstable_mockModule("axios", () => ({
  default: { create: () => ({ get: getMock }) },
}));

const {
  getCurrentWeather,
  getHistoricalWeatherWithFallback,
  getObservearthCooldownRemainingMs,
  resetObservearthCooldown,
} = await import("../client/observearth.client.js");

function httpError(status, headers = {}) {
  const err = new Error(`Request failed with status code ${status}`);
  err.response = { status, headers };
  return err;
}

const daily = { daily: { time: ["2026-11-24"] } };

describe("Observearth rate-limit handling", () => {
  let warnSpy;

  beforeEach(() => {
    getMock.mockReset();
    resetObservearthCooldown();
    warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  // The season fetch sends at most SEASON_CONCURRENCY (2) requests in parallel;
  // once one of them is rate-limited, no further chunks or windows touch the network.
  test("a 429 on historical stops further requests after the in-flight ones", async () => {
    getMock.mockRejectedValue(httpError(429));

    const result = await getHistoricalWeatherWithFallback(
      "geo-1",
      "2026-01-01",
      "2026-11-25",
    );

    expect(getMock.mock.calls.length).toBeLessThanOrEqual(2);
    expect(result.data).toBeNull();
    expect(result.error).toBeTruthy();
    expect(getObservearthCooldownRemainingMs()).toBeGreaterThan(0);
  });

  test("a 503 also stops the requests and starts the cooldown", async () => {
    getMock.mockRejectedValue(httpError(503));

    await getHistoricalWeatherWithFallback("geo-1", "2026-01-01", "2026-11-25");

    expect(getMock.mock.calls.length).toBeLessThanOrEqual(2);
    expect(getObservearthCooldownRemainingMs()).toBeGreaterThan(0);
  });

  test("during the cooldown, calls fail fast without touching the network", async () => {
    getMock.mockRejectedValueOnce(httpError(429));
    await expect(getCurrentWeather("geo-1")).rejects.toThrow("429");

    await expect(getCurrentWeather("geo-2")).rejects.toMatchObject({
      code: "OBSERVEARTH_COOLDOWN",
    });
    const result = await getHistoricalWeatherWithFallback(
      "geo-2",
      "2026-01-01",
      "2026-11-25",
    );

    expect(getMock).toHaveBeenCalledTimes(1);
    expect(result.data).toBeNull();
  });

  test("Retry-After header sets the cooldown length", async () => {
    getMock.mockRejectedValueOnce(httpError(429, { "retry-after": "5" }));
    await expect(getCurrentWeather("geo-1")).rejects.toThrow();

    const remaining = getObservearthCooldownRemainingMs();
    expect(remaining).toBeGreaterThan(3_000);
    expect(remaining).toBeLessThanOrEqual(5_000);
  });

  test("a transient 500 on one season chunk is retried once and the season still succeeds", async () => {
    getMock
      .mockRejectedValueOnce(httpError(500)) // first chunk fails...
      .mockResolvedValue({ data: daily }); // ...its retry and every other chunk succeed

    const result = await getHistoricalWeatherWithFallback(
      "geo-1",
      "2026-01-01",
      "2026-11-25",
    );

    // 181 days in 30-day chunks = 7 chunks, plus 1 retry of the failed chunk.
    expect(getMock).toHaveBeenCalledTimes(8);
    expect(result.data).not.toBeNull();
    expect(result.error).toBeNull();
    expect(getObservearthCooldownRemainingMs()).toBe(0);
  });
});
