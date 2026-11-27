import { barrenAdvisoryAllowed } from "../utils/shared/barrenAudience.js";

describe("barrenAdvisoryAllowed", () => {
  test("allows BIODROPS users", async () => {
    expect(await barrenAdvisoryAllowed({ organization: { organizationCode: "BIODROPS" } })).toBe(true);
    expect(await barrenAdvisoryAllowed({ organization: { organizationCode: "biodrops" } })).toBe(true);
  });

  test("refuses CropGen, AAT and other organizations", async () => {
    expect(await barrenAdvisoryAllowed({ organization: { organizationCode: "CROPGEN" } })).toBe(false);
    expect(await barrenAdvisoryAllowed({ organization: { organizationCode: "AAT" } })).toBe(false);
  });

  test("refuses a user with no organization", async () => {
    expect(await barrenAdvisoryAllowed({ organization: null })).toBe(false);
    expect(await barrenAdvisoryAllowed({})).toBe(false);
    expect(await barrenAdvisoryAllowed(null)).toBe(false);
  });
});
