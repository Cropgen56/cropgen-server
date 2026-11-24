import { NOTICES, fillTemplate, getNotice, validTranslation } from "../features/agent/utils/noticeText.js";

describe("server notices", () => {
  test("placeholders must survive translation", () => {
    expect(validTranslation("Hi {name}!", "नमस्कार {name}!")).toBe(true);
    expect(validTranslation("Hi {name}!", "नमस्कार {नाव}!")).toBe(false);
    expect(validTranslation("Hi {name}!", "नमस्कार!")).toBe(false);
    expect(validTranslation("Hi {name}!", "")).toBe(false);
    expect(validTranslation("Hi {name}!", undefined)).toBe(false);
  });

  test("fillTemplate substitutes known values and leaves unknown ones", () => {
    expect(fillTemplate("Now {field} ({crop})", { field: "F1", crop: "Soy" })).toBe("Now F1 (Soy)");
    expect(fillTemplate("Hi {name}", {})).toBe("Hi {name}");
  });

  test("English needs no translation and fills variables", async () => {
    expect(await getNotice("welcome_farms", "en", { name: "Ravi", title: "CropGen AI assistant" })).toMatch(/^Hi Ravi! I'm your CropGen AI assistant/);
    expect(await getNotice("reset", undefined)).toBe(NOTICES.reset);
  });

  test("every notice is a plain string and placeholders are word-only", () => {
    for (const [k, v] of Object.entries(NOTICES)) {
      expect(typeof v).toBe("string");
      for (const ph of v.match(/\{[^}]*\}/g) || []) expect(ph).toMatch(/^\{\w+\}$/);
    }
  });
});
