import {
  mobilePlanRestrictionMessage,
  restrictPlanToMobileUsd,
} from "../utils/subscription/mobilePlanRestriction.js";

const mobileReq = { headers: { "x-client-app": "cropgen_android" } };
const webReq = { headers: {} };
const row = (currency) => ({ currency, billingCycle: "monthly", pricePerUnitMinor: 100 });
const usdPlan = { brand: "cropgen", platform: "web", pricing: [row("USD")] };
const inrPlan = { brand: "cropgen", platform: "all", pricing: [row("INR")] };

describe("mobile plan region rules", () => {
  it("lets an international mobile user buy a USD plan", () => {
    expect(mobilePlanRestrictionMessage(mobileReq, usdPlan, "USD", "INTL")).toBeNull();
  });
  it("refuses INR and INR-only plans for an international user", () => {
    expect(mobilePlanRestrictionMessage(mobileReq, usdPlan, "INR", "INTL")).toMatch(/USD/);
    expect(mobilePlanRestrictionMessage(mobileReq, inrPlan, "USD", "INTL")).toMatch(/region/);
  });
  it("keeps India on INR only and off web-only plans", () => {
    expect(mobilePlanRestrictionMessage(mobileReq, inrPlan, "INR", "IN")).toBeNull();
    expect(mobilePlanRestrictionMessage(mobileReq, usdPlan, "USD", "IN")).toMatch(/not available/);
  });
  it("does not change web rules", () => {
    expect(mobilePlanRestrictionMessage(webReq, usdPlan, "USD", "IN")).toBeNull();
  });
  it("strips INR rows from USD plans for mobile", () => {
    const p = restrictPlanToMobileUsd({ ...usdPlan, pricing: [row("USD"), row("INR")] });
    expect(p.platform).toBe("mobile");
    expect(p.pricing.map((r) => r.currency)).toEqual(["USD"]);
  });
});
