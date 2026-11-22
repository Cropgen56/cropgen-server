/** NPK requirement/deficit engine and the crop-health score. Pure functions. */
import {
  normalizeCropName,
  calculateNPKFromfarmField,
  buildBarrenLandNpkFromField,
  getBarrenLandNPKRecommendation,
} from "../utils/npk/npkCalculator.js";
import { calcCropHealth, HEAT_LIMIT } from "../utils/crop/health/cropHealth.js";

describe("normalizeCropName (npk)", () => {
  test("keeps digits, drops everything else", () => {
    expect(normalizeCropName("Wheat")).toBe("wheat");
    expect(normalizeCropName("Kidney Beans (Rajma)")).toBe("kidneybeansrajma");
    expect(normalizeCropName("Crop 2")).toBe("crop2");
  });
  test("empty input gives empty string", () => {
    expect(normalizeCropName("")).toBe("");
    expect(normalizeCropName(undefined)).toBe("");
  });
});

describe("calculateNPKFromfarmField", () => {
  // wheat totals N120 P60 K40; vegetative split N.4 P.3 K.4 => N48 P18 K16
  const farm = { cropName: "Wheat", acre: 2.47105 };
  const veg = { bbchStage: 40, stageName: "Stem elongation" };

  test("required NPK follows the stage split of the crop's totals", () => {
    const r = calculateNPKFromfarmField({
      farmField: farm, ndviLatest: 0.6, waterLatest: 0.2, plantGrowthActivity: veg,
    });
    expect(r.required).toEqual({ nitrogenKgPerHa: 48, phosphorousKgPerHa: 18, potassiumKgPerHa: 16 });
  });

  test("early stage and reproductive stage use their own splits", () => {
    const early = calculateNPKFromfarmField({
      farmField: farm, ndviLatest: 0.6, waterLatest: 0.2, plantGrowthActivity: { bbchStage: 10, stageName: "Germination" },
    });
    expect(early.required).toEqual({ nitrogenKgPerHa: 36, phosphorousKgPerHa: 30, potassiumKgPerHa: 12 });
    const repro = calculateNPKFromfarmField({
      farmField: farm, ndviLatest: 0.6, waterLatest: 0.2, plantGrowthActivity: { bbchStage: 65, stageName: "Flowering" },
    });
    expect(repro.required).toEqual({ nitrogenKgPerHa: 36, phosphorousKgPerHa: 12, potassiumKgPerHa: 12 });
  });

  test("healthy NDVI + water: only phosphorus timing creates a deficit (fallback HSI)", () => {
    const r = calculateNPKFromfarmField({
      farmField: farm, ndviLatest: 0.6, waterLatest: 0.2, plantGrowthActivity: veg,
    });
    expect(r.factorSource).toBe("fallback_hsi");
    expect(r.available.nitrogenKgPerHa).toBe(48);
    expect(r.available.potassiumKgPerHa).toBe(16);
    expect(r.available.phosphorousKgPerHa).toBe(15.3); // 18 * 0.85
    expect(r.deficit).toEqual({ nitrogenKgPerHa: 0, phosphorousKgPerHa: 2.7, potassiumKgPerHa: 0 });
    expect(r.satelliteNpk).toBeNull();
  });

  test("low NDVI lowers available nitrogen and raises the deficit", () => {
    const healthy = calculateNPKFromfarmField({ farmField: farm, ndviLatest: 0.6, waterLatest: 0.2, plantGrowthActivity: veg });
    const stressed = calculateNPKFromfarmField({ farmField: farm, ndviLatest: 0.3, waterLatest: 0.2, plantGrowthActivity: veg });
    expect(stressed.available.nitrogenKgPerHa).toBeLessThan(healthy.available.nitrogenKgPerHa);
    expect(stressed.deficit.nitrogenKgPerHa).toBeGreaterThan(healthy.deficit.nitrogenKgPerHa);
    expect(stressed.hsi).toBeLessThan(healthy.hsi);
  });

  test("water stress cuts the requirement to 70%", () => {
    const r = calculateNPKFromfarmField({ farmField: farm, ndviLatest: 0.6, waterLatest: -0.2, plantGrowthActivity: veg });
    expect(r.required.nitrogenKgPerHa).toBe(33.6);
  });

  test("deficit is never negative and available never exceeds required", () => {
    for (const ndvi of [0, 0.2, 0.5, 0.9]) {
      for (const water of [-0.5, 0, 0.3]) {
        const r = calculateNPKFromfarmField({ farmField: farm, ndviLatest: ndvi, waterLatest: water, plantGrowthActivity: veg });
        for (const k of ["nitrogenKgPerHa", "phosphorousKgPerHa", "potassiumKgPerHa"]) {
          expect(r.deficit[k]).toBeGreaterThanOrEqual(0);
          expect(r.available[k]).toBeLessThanOrEqual(r.required[k]);
        }
      }
    }
  });

  test("satellite nutrient factors override the HSI fallback", () => {
    const sat = {
      date: "2025-01-01",
      nutrients: { nitrogen: { factor: 0.5 }, phosphorous: { factor: 0.5 }, potassium: { factor: 0.5 } },
    };
    const r = calculateNPKFromfarmField({
      farmField: farm, ndviLatest: 0.6, waterLatest: 0.2, plantGrowthActivity: veg, satelliteNpkAvailability: sat,
    });
    expect(r.factorSource).toBe("satellite");
    expect(r.available.nitrogenKgPerHa).toBe(24);
    expect(r.hsi).toBe(0.5);
    expect(r.satelliteNpk.date).toBe("2025-01-01");
  });

  test("a non-numeric satellite factor falls back per nutrient", () => {
    const sat = { nutrients: { nitrogen: { factor: 0.5 }, phosphorous: {}, potassium: { factor: "x" } } };
    const r = calculateNPKFromfarmField({
      farmField: farm, ndviLatest: 0.6, waterLatest: 0.2, plantGrowthActivity: veg, satelliteNpkAvailability: sat,
    });
    expect(r.available.nitrogenKgPerHa).toBe(24); // satellite
    expect(r.available.phosphorousKgPerHa).toBe(15.3); // fallback HSI
    expect(r.available.potassiumKgPerHa).toBe(16); // fallback HSI
  });

  test("at maturity nothing more is required", () => {
    const r = calculateNPKFromfarmField({
      farmField: farm, ndviLatest: 0.6, waterLatest: 0.2, plantGrowthActivity: { bbchStage: 90, stageName: "Maturity" },
    });
    const zero = { nitrogenKgPerHa: 0, phosphorousKgPerHa: 0, potassiumKgPerHa: 0 };
    expect(r.required).toEqual(zero);
    expect(r.available).toEqual(zero);
    expect(r.deficit).toEqual(zero);
    expect(typeof r.recommendation).toBe("string");
  });

  test("area is reported in acres and hectares", () => {
    const r = calculateNPKFromfarmField({ farmField: farm, ndviLatest: 0.6, waterLatest: 0.2, plantGrowthActivity: veg });
    expect(r.area).toEqual({ acre: 2.47105, hectare: 1 });
    const none = calculateNPKFromfarmField({ farmField: { cropName: "wheat" }, ndviLatest: 0.6, waterLatest: 0.2, plantGrowthActivity: veg });
    expect(none.area).toEqual({ acre: 0, hectare: 0 });
  });

  test("an unsupported crop throws a clear error", () => {
    expect(() =>
      calculateNPKFromfarmField({ farmField: { cropName: "Moon Cheese" }, ndviLatest: 0.5, waterLatest: 0, plantGrowthActivity: veg }),
    ).toThrow("Crop not supported: Moon Cheese");
  });

  test("returns a text recommendation", () => {
    const r = calculateNPKFromfarmField({ farmField: farm, ndviLatest: 0.6, waterLatest: 0.2, plantGrowthActivity: veg });
    expect(r.recommendation).toEqual(expect.any(String));
    expect(r.recommendation.length).toBeGreaterThan(10);
  });
});

describe("barren land (pre-sowing) NPK", () => {
  test("supported crop gets numbers plus text", () => {
    const r = buildBarrenLandNpkFromField({ farmField: { cropName: "wheat", acre: 2 } });
    expect(r.mode).toBe("pre_sowing_basal");
    expect(r.required).not.toBeNull();
    expect(r.recommendation).toEqual(expect.any(String));
  });
  test("unsupported crop degrades to text only, without throwing", () => {
    const r = buildBarrenLandNpkFromField({ farmField: { cropName: "Moon Cheese", acre: 2 } });
    expect(r.available).toBeNull();
    expect(r.required).toBeNull();
    expect(r.factorSource).toBe("fallback_hsi");
    expect(r.recommendation).toEqual(expect.any(String));
  });
  test("non-numeric area renders as 0.00", () => {
    const txt = getBarrenLandNPKRecommendation({ cropName: "wheat", stageName: "Pre-sowing", areaAcre: "abc" });
    expect(txt).toContain("0.00");
  });
});

describe("calcCropHealth", () => {
  const weatherOk = { current: { temp: 25 }, next7Days: { rainfall: [0, 4, 0, 1, 0, 0, 2] } };
  const growth = (bbchStage) => ({ bbchStage });

  test("a satellite health signal wins and is clamped to 0..100", () => {
    expect(calcCropHealth({ satelliteHealthSignal: { health: 150 } }).percentage).toBe(100);
    expect(calcCropHealth({ satelliteHealthSignal: { health: -20 } }).percentage).toBe(0);
    const r = calcCropHealth({ satelliteHealthSignal: { health: 72.4 } });
    expect(r).toMatchObject({ percentage: 72, score: 0.72, category: "Good" });
  });

  test("category boundaries", () => {
    const cat = (h) => calcCropHealth({ satelliteHealthSignal: { health: h } }).category;
    expect(cat(100)).toBe("Excellent");
    expect(cat(85)).toBe("Excellent");
    expect(cat(84)).toBe("Good");
    expect(cat(70)).toBe("Good");
    expect(cat(69)).toBe("Moderate");
    expect(cat(50)).toBe("Moderate");
    expect(cat(49)).toBe("Poor");
    expect(cat(30)).toBe("Poor");
    expect(cat(29)).toBe("Critical");
    expect(cat(0)).toBe("Critical");
  });

  test("healthy field scores Excellent (35/25/20/20 weighting)", () => {
    const r = calcCropHealth({
      ndvi: { ndviLatest: 0.8 }, water: { waterLatest: 0.2 }, weatherSummary: weatherOk,
      plantGrowthActivity: growth(50), farmField: { cropName: "wheat" },
    });
    // ndvi 90, water 85, weather 90, nutrient 85 -> 87.75
    expect(r.percentage).toBe(88);
    expect(r.score).toBe(0.88);
    expect(r.category).toBe("Excellent");
  });

  test("stressed field scores Poor", () => {
    const r = calcCropHealth({
      ndvi: { ndviLatest: 0.2, ndviTrend: -0.1 },
      water: { waterLatest: -0.2, stressDays: 6 },
      weatherSummary: { current: { temp: 40 }, next7Days: { rainfall: [0, 0, 0] } },
      plantGrowthActivity: growth(70),
      npkManagement: {
        required: { nitrogenKgPerHa: 100, phosphorousKgPerHa: 50, potassiumKgPerHa: 50 },
        available: { nitrogenKgPerHa: 10, phosphorousKgPerHa: 5, potassiumKgPerHa: 5 },
      },
      farmField: { cropName: "wheat" },
    });
    expect(r.percentage).toBeLessThan(50);
    expect(r.category).toBe("Poor");
  });

  test("worse inputs never score higher than better inputs", () => {
    const base = {
      weatherSummary: weatherOk, plantGrowthActivity: growth(50), farmField: { cropName: "wheat" },
    };
    const good = calcCropHealth({ ...base, ndvi: { ndviLatest: 0.8 }, water: { waterLatest: 0.2 } });
    const dryWater = calcCropHealth({ ...base, ndvi: { ndviLatest: 0.8 }, water: { waterLatest: -0.3 } });
    const lowNdvi = calcCropHealth({ ...base, ndvi: { ndviLatest: 0.2 }, water: { waterLatest: 0.2 } });
    expect(dryWater.percentage).toBeLessThan(good.percentage);
    expect(lowNdvi.percentage).toBeLessThan(good.percentage);
  });

  test("heat above the crop's limit lowers the score (wheat limit 32C)", () => {
    expect(HEAT_LIMIT.wheat).toBe(32);
    const mk = (temp) => calcCropHealth({
      ndvi: { ndviLatest: 0.8 }, water: { waterLatest: 0.2 },
      weatherSummary: { current: { temp }, next7Days: { rainfall: [1] } },
      plantGrowthActivity: growth(50), farmField: { cropName: "wheat" },
    }).percentage;
    expect(mk(36)).toBeLessThan(mk(25));
  });

  test("optical composite score blends in at 18%", () => {
    const args = {
      ndvi: { ndviLatest: 0.8 }, water: { waterLatest: 0.2 }, weatherSummary: weatherOk,
      plantGrowthActivity: growth(50), farmField: { cropName: "wheat" },
    };
    const plain = calcCropHealth(args).percentage;
    const blended = calcCropHealth({ ...args, opticalIndicesSummary: { compositeVegetationScore: 20 } }).percentage;
    expect(blended).toBe(Math.round(87.75 * 0.82 + 20 * 0.18));
    expect(blended).toBeLessThan(plain);
  });

  test("always returns a recommendation string", () => {
    const r = calcCropHealth({ satelliteHealthSignal: { health: 10 } });
    expect(r.recommendation).toEqual(expect.any(String));
    expect(r.recommendation.length).toBeGreaterThan(0);
  });
});
