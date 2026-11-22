/** Carbon balance, area conversion and farm-geometry helpers. Pure functions. */
import { calculateCarbonBalance } from "../utils/carbon/carbonCalculator.js";
import { acresToHectares, buildAreaBreakdown } from "../utils/npk/npkArea.js";
import { formatAcresTwoDecimals } from "../utils/format/acres.js";
import {
  fieldCentroid,
  buildCentroidSamplePolygon,
  resolveAdvisoryApiGeometry,
  describeAdvisoryGeometry,
  ADVISORY_SAMPLE_HECTARES,
  ADVISORY_FULL_GEOMETRY_MAX_HECTARES,
} from "../utils/geometry/farmGeometry.js";
import { area as turfArea } from "@turf/turf";

describe("calculateCarbonBalance", () => {
  test("no inputs: nothing emitted, nothing captured", () => {
    expect(calculateCarbonBalance({})).toEqual({
      emissionKgCO2: 0,
      capturedKgCO2: 0,
      netBalanceKgCO2: 0,
    });
  });

  test("fertilizer N emits 2.98 kg CO2e per kg N", () => {
    const r = calculateCarbonBalance({ nutrientDeficit: { nitrogenKgPerHa: 100 } });
    expect(r.emissionKgCO2).toBeCloseTo(298, 1);
    expect(r.netBalanceKgCO2).toBeCloseTo(-298, 1);
  });

  test("zero or negative N deficit adds no fertilizer emission", () => {
    expect(calculateCarbonBalance({ nutrientDeficit: { nitrogenKgPerHa: 0 } }).emissionKgCO2).toBe(0);
    expect(calculateCarbonBalance({ nutrientDeficit: { nitrogenKgPerHa: -50 } }).emissionKgCO2).toBe(0);
  });

  test("irrigation emits only when irrigation is needed; drip uses less than flood", () => {
    const base = { acre: 2.471 }; // 1 ha
    expect(calculateCarbonBalance({ ...base, irrigationRequirement: { needsIrrigation: false } }).emissionKgCO2).toBe(0);
    const drip = calculateCarbonBalance({ ...base, irrigationRequirement: { needsIrrigation: true }, irrigationType: "drip" });
    const flood = calculateCarbonBalance({ ...base, irrigationRequirement: { needsIrrigation: true }, irrigationType: "flood" });
    expect(drip.emissionKgCO2).toBeCloseTo(0.3 * 0.82, 1);
    expect(flood.emissionKgCO2).toBeCloseTo(0.6 * 0.82, 1);
    expect(drip.emissionKgCO2).toBeLessThan(flood.emissionKgCO2);
  });

  test("diesel pump adds emissions proportional to area", () => {
    const one = calculateCarbonBalance({ acre: 2.471, useDieselPump: true }).emissionKgCO2;
    const two = calculateCarbonBalance({ acre: 4.942, useDieselPump: true }).emissionKgCO2;
    expect(one).toBeCloseTo(0.5 * 2.68, 1);
    expect(two).toBeCloseTo(one * 2, 0);
  });

  test("healthy mid-season NDVI captures carbon and offsets emissions", () => {
    const r = calculateCarbonBalance({ acre: 2.471, ndviLatest: 0.8, bbchStage: 65 });
    expect(r.capturedKgCO2).toBeGreaterThan(0);
    expect(r.netBalanceKgCO2).toBe(r.capturedKgCO2 - r.emissionKgCO2);
  });

  test("NDVI below 0.15 captures nothing", () => {
    expect(calculateCarbonBalance({ ndviLatest: 0.1, bbchStage: 65 }).capturedKgCO2).toBe(0);
  });

  test("missing NDVI: assume 0.4 once the crop is past emergence, else 0", () => {
    expect(calculateCarbonBalance({ ndviLatest: null, bbchStage: 30 }).capturedKgCO2).toBeGreaterThan(0);
    expect(calculateCarbonBalance({ ndviLatest: null, bbchStage: 3 }).capturedKgCO2).toBe(0);
  });

  test("capture grows with NDVI and with area", () => {
    const lo = calculateCarbonBalance({ acre: 5, ndviLatest: 0.5, bbchStage: 50 }).capturedKgCO2;
    const hi = calculateCarbonBalance({ acre: 5, ndviLatest: 0.9, bbchStage: 50 }).capturedKgCO2;
    const big = calculateCarbonBalance({ acre: 50, ndviLatest: 0.5, bbchStage: 50 }).capturedKgCO2;
    expect(hi).toBeGreaterThan(lo);
    expect(big).toBeGreaterThan(lo);
  });

  test("zero area captures nothing", () => {
    expect(calculateCarbonBalance({ acre: 0, ndviLatest: 0.8, bbchStage: 65 }).capturedKgCO2).toBe(0);
  });

  test("all outputs are rounded to one decimal", () => {
    const r = calculateCarbonBalance({
      acre: 3.3,
      nutrientDeficit: { nitrogenKgPerHa: 37.7 },
      irrigationRequirement: { needsIrrigation: true },
      ndviLatest: 0.63,
      bbchStage: 41,
    });
    for (const v of Object.values(r)) expect(Math.round(v * 10) / 10).toBe(v);
  });
});

describe("area helpers", () => {
  test("acresToHectares", () => {
    expect(acresToHectares(2.47105)).toBe(1);
    expect(acresToHectares(0)).toBe(0);
    expect(acresToHectares("abc")).toBe(0);
    expect(acresToHectares(undefined)).toBe(0);
  });

  test("formatAcresTwoDecimals", () => {
    expect(formatAcresTwoDecimals(5.999)).toBe("6.00");
    expect(formatAcresTwoDecimals("3.456")).toBe("3.46");
    expect(formatAcresTwoDecimals(0)).toBe("0.00");
    expect(formatAcresTwoDecimals("abc")).toBe("abc");
    expect(formatAcresTwoDecimals(undefined)).toBe("");
    expect(formatAcresTwoDecimals(null)).toBe("0.00"); // Number(null) === 0
  });

  test("buildAreaBreakdown totals add up", () => {
    const b = buildAreaBreakdown(
      { nitrogenKgPerHa: 100, phosphorousKgPerHa: 50, potassiumKgPerHa: 25 },
      2.47105,
    );
    expect(b.unit).toBe("kg");
    expect(b.area).toEqual({ acre: 2.5, hectare: 1 });
    expect(b.nutrients.nitrogen.kgPerHa).toBe(100);
    expect(b.totals.perHa).toBe(175);
    expect(b.totals.totalForFieldKg).toBeCloseTo(
      b.nutrients.nitrogen.totalForFieldKg +
        b.nutrients.phosphorous.totalForFieldKg +
        b.nutrients.potassium.totalForFieldKg,
      1,
    );
  });

  test("buildAreaBreakdown tolerates missing data", () => {
    const b = buildAreaBreakdown(undefined, undefined);
    expect(b.totals).toEqual({ perHa: 0, perAcre: 0, totalForFieldKg: 0 });
  });
});

describe("farm geometry", () => {
  // ~1 ha square near Pune (0.0001 deg ~ 11 m)
  const sq = (lat, lng, d) => [
    { lat, lng },
    { lat, lng: lng + d },
    { lat: lat + d, lng: lng + d },
    { lat: lat + d, lng },
  ];
  const small = sq(18.5, 73.8, 0.0009); // ~100m x 100m = 1ha
  const large = sq(18.5, 73.8, 0.01); // ~1.1km square = ~120ha

  test("fieldCentroid averages the points", () => {
    const c = fieldCentroid([{ lat: 0, lng: 0 }, { lat: 0, lng: 2 }, { lat: 2, lng: 2 }, { lat: 2, lng: 0 }]);
    expect(c).toEqual({ lng: 1, lat: 1 });
  });
  test("fieldCentroid rejects <3 points and bad coordinates", () => {
    expect(() => fieldCentroid([{ lat: 0, lng: 0 }])).toThrow(/minimum 3 points/);
    expect(() => fieldCentroid(undefined)).toThrow(/minimum 3 points/);
    expect(() => fieldCentroid([{ lat: "x", lng: 0 }, { lat: 1, lng: 1 }, { lat: 2, lng: 2 }])).toThrow(/non-numeric/);
  });

  test("centroid sample polygon is closed and ~1.5 ha", () => {
    const poly = buildCentroidSamplePolygon(large);
    const ring = poly.coordinates[0];
    expect(ring).toHaveLength(5);
    expect(ring[0]).toEqual(ring[4]);
    const ha = turfArea(poly) / 10000;
    expect(ha).toBeGreaterThan(ADVISORY_SAMPLE_HECTARES * 0.95);
    expect(ha).toBeLessThan(ADVISORY_SAMPLE_HECTARES * 1.05);
  });

  test("small farm keeps its real boundary", () => {
    const r = resolveAdvisoryApiGeometry({ field: small });
    expect(r.sampled).toBe(false);
    expect(r.farmAreaHa).toBeLessThanOrEqual(ADVISORY_FULL_GEOMETRY_MAX_HECTARES);
    expect(r.geometry).toEqual(r.fullGeometry);
    const ring = r.geometry.coordinates[0];
    expect(ring[0]).toEqual(ring[ring.length - 1]); // auto-closed
  });

  test("large farm is replaced by a 1.5 ha centroid sample", () => {
    const r = resolveAdvisoryApiGeometry({ field: large });
    expect(r.sampled).toBe(true);
    expect(r.sampleHa).toBe(ADVISORY_SAMPLE_HECTARES);
    expect(r.farmAreaHa).toBeGreaterThan(ADVISORY_FULL_GEOMETRY_MAX_HECTARES);
    expect(r.fullGeometry).not.toEqual(r.geometry);
  });

  test("invalid field throws a clear error", () => {
    expect(() => resolveAdvisoryApiGeometry({ field: [] })).toThrow(/minimum 3 points/);
    expect(() => resolveAdvisoryApiGeometry(undefined)).toThrow(/minimum 3 points/);
  });

  test("describeAdvisoryGeometry", () => {
    expect(describeAdvisoryGeometry(null)).toBe("geometry unresolved");
    expect(describeAdvisoryGeometry({ sampled: true, sampleHa: 1.5, farmAreaHa: 40 })).toBe("1.5ha centroid sample (40.00ha farm)");
    expect(describeAdvisoryGeometry({ sampled: false, farmAreaHa: 1.234 })).toBe("full field (1.23ha farm)");
    expect(describeAdvisoryGeometry({ sampled: false })).toBe("full field (farm)");
  });
});
