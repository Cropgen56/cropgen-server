import { jest } from "@jest/globals";

const getCurrentWeather = jest.fn();
const getForecastWeather = jest.fn();

jest.unstable_mockModule("../client/observearth.client.js", () => ({
  getCurrentWeather,
  getForecastWeather,
  fetchWeatherBundle: jest.fn(),
}));

const { runWeatherSuggestionModule, describeWeatherError } = await import(
  "../water/weatherSuggestion.module.js"
);

function httpError(status, data) {
  const err = new Error(`Request failed with status code ${status}`);
  err.response = { status, data };
  return err;
}

const ctx = { mode: "barren", geometryId: "geo-1", logStep: () => {} };

describe("barren land weather error reasons", () => {
  beforeEach(() => {
    getCurrentWeather.mockReset();
    getForecastWeather.mockReset();
  });

  test("error message names why each call failed", async () => {
    getCurrentWeather.mockRejectedValue(httpError(429));
    getForecastWeather.mockRejectedValue(
      httpError(503, { error: "Rate limiting failed. Redis unavailable." }),
    );

    const result = await runWeatherSuggestionModule(ctx);

    expect(result.errors).toEqual([
      "Weather unavailable for barren land advisory (current: 429; forecast: 503 Rate limiting failed. Redis unavailable.)",
    ]);
  });

  test("describeWeatherError covers cooldown, timeout, 403 detail and plain errors", () => {
    expect(
      describeWeatherError(
        Object.assign(new Error("paused"), { code: "OBSERVEARTH_COOLDOWN" }),
      ),
    ).toBe("OBSERVEARTH_COOLDOWN");
    expect(
      describeWeatherError(
        Object.assign(new Error("timeout of 15000ms exceeded"), {
          code: "ECONNABORTED",
        }),
      ),
    ).toBe("timeout");
    expect(describeWeatherError(httpError(403, { detail: "Not allowed" }))).toBe(
      "403 Not allowed",
    );
    expect(
      describeWeatherError(Object.assign(new Error("x"), { code: "ENOTFOUND" })),
    ).toBe("ENOTFOUND");
    expect(describeWeatherError(undefined)).toBe("no data");
  });

  test("one call succeeding still produces a result, no error", async () => {
    getCurrentWeather.mockRejectedValue(httpError(429));
    getForecastWeather.mockResolvedValue({ daily: { time: [] } });

    const result = await runWeatherSuggestionModule(ctx);

    expect(result.errors ?? []).toEqual([]);
  });
});
