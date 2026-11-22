/** WhatsApp advisory message formatting. Pure functions. */
import {
  calculateCropAgeInDays,
  formatFarmAdvisoryMessage,
  formatFarmAdvisoryMessageHindi,
} from "../utils/whatsapp/messageFormat.js";

const DAY = 24 * 60 * 60 * 1000;

describe("calculateCropAgeInDays", () => {
  test("no sowing date gives null", () => {
    expect(calculateCropAgeInDays()).toBeNull();
    expect(calculateCropAgeInDays(null)).toBeNull();
    expect(calculateCropAgeInDays("")).toBeNull();
  });
  test("counts whole days since sowing", () => {
    expect(calculateCropAgeInDays(new Date(Date.now() - 10 * DAY - 1000))).toBe(10);
    expect(calculateCropAgeInDays(new Date(Date.now() - 36 * 60 * 60 * 1000))).toBe(1);
  });
  test("a future sowing date is clamped to 0", () => {
    expect(calculateCropAgeInDays(new Date(Date.now() + 5 * DAY))).toBe(0);
  });
});

describe("formatFarmAdvisoryMessage", () => {
  const farm = {
    fieldName: "North plot",
    cropName: "Wheat",
    variety: "HD-2967",
    acre: 2.456,
    typeOfFarming: "Organic",
    typeOfIrrigation: "Drip",
    sowingDate: new Date(Date.now() - 20 * DAY - 1000),
  };
  const farmer = { firstName: "Asha", lastName: "Patil" };
  const activities = [
    { type: "SPRAY", title: "Spray today", message: "Apply fungicide", details: { chemical: "Carbendazim", quantity: "200 g/acre", method: "Foliar", time: "Morning", risk: "Wind" } },
    { type: "IRRIGATION", title: "Irrigate", message: "Soil is dry" },
    { type: "SOMETHING_NEW", title: "Other", message: "Unknown type", details: {} },
  ];

  test("English message: greeting, farm details, every activity, footer", () => {
    const m = formatFarmAdvisoryMessage(activities, farm, farmer, "en");
    expect(m).toContain("Farm Advisory – Today");
    expect(m).toContain("Asha Patil, hello");
    expect(m).toContain("Field: North plot");
    expect(m).toContain("Crop: Wheat (HD-2967)");
    expect(m).toContain("Area: 2.46 Acre");
    expect(m).toContain("Crop Age: 20 days");
    for (const a of activities) expect(m).toContain(a.title);
    expect(m).toContain("Please follow the advisory carefully.");
  });

  test("activity type icons, with a default for unknown types", () => {
    const m = formatFarmAdvisoryMessage(activities, null, null, "en");
    expect(m).toContain("🧴 Spray today");
    expect(m).toContain("🚿 Irrigate");
    expect(m).toContain("📌 Other");
  });

  test("details block lists only the provided fields", () => {
    const m = formatFarmAdvisoryMessage(activities, null, null);
    expect(m).toContain("• Chemical: Carbendazim");
    expect(m).toContain("• Quantity: 200 g/acre");
    expect(m).toContain("• Risk Alert: Wind");
    expect(m).not.toContain("Fertilizer:");
    expect(m.match(/Details:/g)).toHaveLength(1); // none for empty/missing details
  });

  test("separators go between activities, not after the last", () => {
    const sep = "——————————————";
    const m = formatFarmAdvisoryMessage(activities, null, null);
    expect(m.split(sep)).toHaveLength(3); // 3 activities -> 2 separators
    expect(m.trimEnd().endsWith("assistance.")).toBe(true);
  });

  test("farmer name falls back per language", () => {
    expect(formatFarmAdvisoryMessage([], null, null, "en")).toContain("Farmer, hello");
    expect(formatFarmAdvisoryMessage([], null, null, "hi")).toContain("किसान, नमस्ते");
    expect(formatFarmAdvisoryMessage([], null, null, "mr")).toContain("शेतकरी, नमस्कार");
    expect(formatFarmAdvisoryMessage([], null, { firstName: "Raj" }, "en")).toContain("Raj, hello");
  });

  test("Hindi and Marathi use their own labels and footer", () => {
    const hi = formatFarmAdvisoryMessage(activities, farm, farmer, "hi");
    expect(hi).toContain("कृषि सलाह – आज");
    expect(hi).toContain("एकड़");
    expect(hi).toContain("फसल आयु: 20 दिन");
    expect(hi).toContain("कृपया सलाह का पालन करें।");
    const mr = formatFarmAdvisoryMessage(activities, farm, farmer, "mr");
    expect(mr).toContain("शेती सल्ला – आज");
    expect(mr).toContain("एकर");
    expect(mr).toContain("पिक वय: 20 दिवस");
  });

  test("language codes are case-insensitive and trimmed to 2 letters", () => {
    expect(formatFarmAdvisoryMessage([], null, null, "HI-IN")).toContain("कृषि सलाह");
    expect(formatFarmAdvisoryMessage([], null, null, undefined)).toContain("Farm Advisory");
    expect(formatFarmAdvisoryMessage([], null, null, "xx")).toContain("Farm Advisory"); // unknown -> English
  });

  test("a farm without sowing date omits crop age; missing acre renders 0.00", () => {
    const m = formatFarmAdvisoryMessage([], { ...farm, sowingDate: undefined, acre: undefined }, farmer);
    expect(m).not.toContain("Crop Age");
    expect(m).toContain("Area: 0.00 Acre");
  });

  test("empty activity list still produces a valid message", () => {
    const m = formatFarmAdvisoryMessage([], farm, farmer);
    expect(m).toContain("Farm Details");
    expect(m).toContain("Please follow the advisory");
  });
});

describe("formatFarmAdvisoryMessageHindi (static sample)", () => {
  test("contains all six sample message sections", () => {
    const m = formatFarmAdvisoryMessageHindi();
    for (let i = 1; i <= 6; i++) expect(m).toContain(`MESSAGE ${i}`);
  });
});
