/** Growing-degree-day maths and crop stage lookup. Pure functions, no I/O. */
import {
  normalizeCropName,
  getBaseTemperature,
  getCropStageCurve,
  getCropSeasonDays,
  calculateDailyGDD,
  normalizeWeatherData,
  calculateCumulativeGDD,
  getCropStage,
  getCropGrowthStage,
} from "../utils/crop/growth/gddCalculator.js";
import { CROP_BASE_TEMPERATURE } from "../utils/crop/growth/cropBaseTemperature.js";
import { CROP_MATURITY_GDD, CROP_SEASON_DAYS, PERENNIAL_OR_MULTI_HARVEST_CROPS } from "../utils/crop/growth/cropMaturityGDD.js";
import { CROP_CATEGORY_MAP } from "../utils/crop/growth/cropCategoryMap.js";
import { BBCH_STAGE_MAP } from "../utils/crop/growth/bbchStageMap.js";

describe("normalizeCropName", () => {
  test("lower-cases and strips non-letters", () => {
    expect(normalizeCropName("Sugar-Cane 2")).toBe("sugarcane");
    expect(normalizeCropName("WHEAT")).toBe("wheat");
  });
  test("nullish input stays undefined instead of throwing", () => {
    expect(normalizeCropName(undefined)).toBeUndefined();
    expect(normalizeCropName(null)).toBeUndefined();
  });
});

describe("getBaseTemperature", () => {
  test("known crops use their own base temperature", () => {
    expect(getBaseTemperature("Wheat")).toBe(0);
    expect(getBaseTemperature("rice")).toBe(10);
    expect(getBaseTemperature("Sugar cane")).toBe(12);
  });
  test("unknown / missing crops fall back to default", () => {
    expect(getBaseTemperature("not-a-crop")).toBe(CROP_BASE_TEMPERATURE.default);
    expect(getBaseTemperature(undefined)).toBe(CROP_BASE_TEMPERATURE.default);
  });
});

describe("calculateDailyGDD", () => {
  test("is the mean temperature minus base", () => {
    expect(calculateDailyGDD(30, 20, 10)).toBe(15);
  });
  test("never negative", () => {
    expect(calculateDailyGDD(8, 2, 10)).toBe(0);
  });
  test("missing temperatures give 0", () => {
    expect(calculateDailyGDD(null, 10, 5)).toBe(0);
    expect(calculateDailyGDD(20, undefined, 5)).toBe(0);
  });
  test("maxTempCap limits Tmax", () => {
    expect(calculateDailyGDD(40, 20, 10, { maxTempCap: 30 })).toBe(15);
    // cap above Tmax changes nothing
    expect(calculateDailyGDD(25, 15, 10, { maxTempCap: 30 })).toBe(10);
  });
  test("a non-finite cap is ignored", () => {
    expect(calculateDailyGDD(40, 20, 10, { maxTempCap: NaN })).toBe(20);
  });
  test("accepts numeric strings", () => {
    expect(calculateDailyGDD("30", "20", 10)).toBe(15);
  });
});

describe("normalizeWeatherData / calculateCumulativeGDD", () => {
  const weather = {
    daily: {
      time: ["2025-01-01", "2025-01-02", "2025-01-03", "2025-01-04"],
      temp_max: [30, 30, 8, 32],
      temp_min: [20, 20, 2, 22],
    },
  };

  test("zips the arrays into per-day rows", () => {
    expect(normalizeWeatherData(weather)).toEqual([
      { date: "2025-01-01", temp_max: 30, temp_min: 20 },
      { date: "2025-01-02", temp_max: 30, temp_min: 20 },
      { date: "2025-01-03", temp_max: 8, temp_min: 2 },
      { date: "2025-01-04", temp_max: 32, temp_min: 22 },
    ]);
  });
  test("missing / malformed weather gives []", () => {
    expect(normalizeWeatherData(null)).toEqual([]);
    expect(normalizeWeatherData({})).toEqual([]);
    expect(normalizeWeatherData({ daily: {} })).toEqual([]);
  });

  test("accumulates GDD day by day", () => {
    const r = calculateCumulativeGDD(weather, 10);
    expect(r.map((d) => d.dailyGDD)).toEqual([15, 15, 0, 17]);
    expect(r.map((d) => d.cumulativeGDD)).toEqual([15, 30, 30, 47]);
  });
  test("ignores days before the sowing date", () => {
    const r = calculateCumulativeGDD(weather, 10, "2025-01-03");
    expect(r.map((d) => d.date)).toEqual(["2025-01-03", "2025-01-04"]);
    expect(r[r.length - 1].cumulativeGDD).toBe(17);
  });
  test("no weather gives []", () => {
    expect(calculateCumulativeGDD(null, 10)).toEqual([]);
  });
  test("cumulative GDD never decreases", () => {
    const r = calculateCumulativeGDD(weather, 10);
    for (let i = 1; i < r.length; i++) {
      expect(r[i].cumulativeGDD).toBeGreaterThanOrEqual(r[i - 1].cumulativeGDD);
    }
  });
});

describe("getCropStageCurve", () => {
  test("rescales the category curve to the crop's own maturity GDD", () => {
    const curve = getCropStageCurve("wheat");
    expect(curve[curve.length - 1].max).toBe(CROP_MATURITY_GDD.wheat);
    // same stage names/codes as the category, only thresholds change
    const cat = BBCH_STAGE_MAP.cereal;
    expect(curve.map((s) => s.stage)).toEqual(cat.map((s) => s.stage));
    expect(curve.map((s) => s.bbch)).toEqual(cat.map((s) => s.bbch));
  });
  test("thresholds stay strictly non-decreasing and positive", () => {
    for (const crop of ["wheat", "rice", "sugarcane", "tomato"]) {
      const curve = getCropStageCurve(crop);
      for (let i = 0; i < curve.length; i++) {
        expect(curve[i].max).toBeGreaterThanOrEqual(1);
        if (i) expect(curve[i].max).toBeGreaterThanOrEqual(curve[i - 1].max);
      }
    }
  });
  test("a perennial crop keeps the unscaled category curve", () => {
    const perennial = [...PERENNIAL_OR_MULTI_HARVEST_CROPS][0];
    expect(perennial).toBeDefined();
    const category = CROP_CATEGORY_MAP[perennial] || "vegetable";
    expect(getCropStageCurve(perennial)).toEqual(BBCH_STAGE_MAP[category] || BBCH_STAGE_MAP.vegetable);
  });
  test("unknown crop falls back to the vegetable curve", () => {
    expect(getCropStageCurve("zzz-unknown")).toEqual(BBCH_STAGE_MAP.vegetable);
  });
});

describe("getCropSeasonDays", () => {
  test("uses the crop's own season length", () => {
    expect(getCropSeasonDays("sugarcane", 100)).toBe(CROP_SEASON_DAYS.sugarcane);
    expect(getCropSeasonDays("wheat", 999)).toBe(CROP_SEASON_DAYS.wheat);
  });
  test("falls back to the category default for unknown crops", () => {
    expect(getCropSeasonDays("zzz-unknown", 111)).toBe(111);
  });
  test("perennials always use the category default", () => {
    for (const c of PERENNIAL_OR_MULTI_HARVEST_CROPS) {
      expect(getCropSeasonDays(c, 77)).toBe(77);
    }
  });
});

describe("getCropStage (simple)", () => {
  test("negative or missing GDD is pre-sowing", () => {
    expect(getCropStage("wheat", -1)).toBe("Pre-sowing");
    expect(getCropStage("wheat", null)).toBe("Pre-sowing");
  });
  test("walks through the cereal stages in order", () => {
    expect(getCropStage("wheat", 0)).toBe("Germination");
    expect(getCropStage("wheat", 200)).toBe("Germination");
    expect(getCropStage("wheat", 201)).toBe("Tillering");
    expect(getCropStage("wheat", 700)).toBe("Stem Elongation");
  });
  test("past the final threshold is Maturity", () => {
    expect(getCropStage("wheat", 1e6)).toBe("Maturity");
  });
});

describe("getCropGrowthStage (BBCH)", () => {
  test("invalid GDD returns the first stage with zero progress", () => {
    for (const bad of [null, undefined, NaN, -5]) {
      const r = getCropGrowthStage("wheat", bad);
      expect(r.overallProgress).toBe(0);
      expect(r.stageProgress).toBe(0);
      expect(r.stageName).toBe(getCropStageCurve("wheat")[0].stage);
    }
  });

  test("progress is clamped to 0..100 and stage advances with GDD", () => {
    const total = CROP_MATURITY_GDD.wheat;
    let lastBbch = -1;
    for (const g of [0, total * 0.1, total * 0.3, total * 0.6, total * 0.9, total, total * 2]) {
      const r = getCropGrowthStage("wheat", g);
      expect(r.overallProgress).toBeGreaterThanOrEqual(0);
      expect(r.overallProgress).toBeLessThanOrEqual(100);
      expect(r.stageProgress).toBeGreaterThanOrEqual(0);
      expect(r.stageProgress).toBeLessThanOrEqual(100);
      expect(r.bbchStage).toBeGreaterThanOrEqual(lastBbch);
      lastBbch = r.bbchStage;
    }
  });

  test("beyond total GDD sits in the final stage at 100% overall", () => {
    const curve = getCropStageCurve("wheat");
    const r = getCropGrowthStage("wheat", CROP_MATURITY_GDD.wheat * 3);
    expect(r.stageName).toBe(curve[curve.length - 1].stage);
    expect(r.overallProgress).toBe(100);
  });

  test("NDVI does not move the stage before total GDD is reached", () => {
    const g = CROP_MATURITY_GDD.wheat * 0.4;
    const ndvi = { values: [0.8, 0.6, 0.4], ndviLatest: 0.4 };
    expect(getCropGrowthStage("wheat", g, ndvi).stageName).toBe(
      getCropGrowthStage("wheat", g).stageName,
    );
  });

  test("result carries description and cumulativeGDD", () => {
    const r = getCropGrowthStage("rice", 500);
    expect(r.cumulativeGDD).toBe(500);
    expect(typeof r.description).toBe("string");
  });
});
