import { hasOfficialSource, citedSources, formatWebCitations, hasCitations, looksLikeDoseQuestion, userLocationFor, createSearchBudget, OFFICIAL_DOMAINS } from "../features/agent/core/webSearch.js";

describe("web citations", () => {
  test("markdown links become numbered references + a Sources list", () => {
    const raw = "The 24th installment was ₹2,000 ([pib.gov.in](https://www.pib.gov.in/x?id=1&utm_source=openai)). More at ([pmkisan.gov.in](https://pmkisan.gov.in/)).";
    expect(hasCitations(raw)).toBe(true);
    const { text, sources } = formatWebCitations(raw);
    expect(sources.map((s) => s.domain)).toEqual(["pib.gov.in", "pmkisan.gov.in"]);
    expect(text).toMatch(/₹2,000 \[1\]\./);
    expect(text).toMatch(/Sources:\n\[1\] pib\.gov\.in — https:\/\/www\.pib\.gov\.in\/x\?id=1\n\[2\] pmkisan\.gov\.in/);
    expect(text).not.toMatch(/utm_source|\]\(/);
  });
  test("the same source is numbered once", () => {
    const { sources, text } = formatWebCitations("A ([x.in](https://x.in/a)) and B ([x.in](https://x.in/a)).");
    expect(sources).toHaveLength(1);
    expect(text).toMatch(/A \[1\] and B \[1\]\./);
  });
  test("text without links is untouched", () => {
    expect(formatWebCitations("Hello there.")).toEqual({ text: "Hello there.", sources: [] });
    expect(hasCitations("Hello")).toBe(false);
  });
});

describe("dose-question detection", () => {
  test.each([
    ["How much urea per acre for wheat?", true],
    ["what spray for leaf spot", true],
    ["mancozeb dose per litre", true],
    ["युरिया किती द्यावे खुराक", true],
    ["What is the weather today?", false],
    ["Tell me a joke", false],
  ])("%s -> %s", (q, expected) => expect(looksLikeDoseQuestion(q)).toBe(expected));
});

describe("search location + budget", () => {
  test("region/city come from the profile", () => {
    expect(userLocationFor({ state: "MH", district: "YAVATMAL" })).toEqual({ type: "approximate", country: "IN", region: "Maharashtra", city: "Yavatmal" });
    expect(userLocationFor({})).toEqual({ type: "approximate", country: "IN" });
  });
  test("daily cap", () => {
    const b = createSearchBudget(2);
    expect(b.allowed("u")).toBe(true);
    b.record("u"); b.record("u");
    expect(b.allowed("u")).toBe(false);
    expect(b.allowed("other")).toBe(true);
  });
  test("official list is specific, not a generic suffix", () => {
    expect(OFFICIAL_DOMAINS).toEqual(expect.arrayContaining(["gov.in", "ac.in", "icar.org.in"]));
    // never a bare generic suffix, which would make every website "official"
    for (const bad of ["com", "in", "org", "net", "co.in", "edu"]) expect(OFFICIAL_DOMAINS).not.toContain(bad);
  });
});

describe("official source check", () => {
  const src = (...hosts) => hosts.map((h, i) => ({ n: i + 1, domain: h, url: `https://${h}/` }));
  test("government / university / ICAR count as official", () => {
    expect(hasOfficialSource(src("pib.gov.in"))).toBe(true);
    expect(hasOfficialSource(src("mpkv.ac.in"))).toBe(true);
    expect(hasOfficialSource(src("kvk.icar.gov.in"))).toBe(true);
    expect(hasOfficialSource(src("icar.org.in"))).toBe(true);
    expect(hasOfficialSource(src("eagri.org"))).toBe(true);
  });
  test("blogs, shops and video sites do not", () => {
    expect(hasOfficialSource(src("youtube.com", "agrishop.com", "myfarmblog.in"))).toBe(false);
    expect(hasOfficialSource([])).toBe(false);
  });
  test("lookalike hosts are not official", () => {
    expect(hasOfficialSource(src("gov.in.evil.com"))).toBe(false);
    expect(hasOfficialSource(src("notgov.in"))).toBe(false);
  });
  test("citedSources reads sources out of a raw reply", () => {
    expect(citedSources("Dose X ([mpkv.ac.in](https://mpkv.ac.in/a)).").map((s) => s.domain)).toEqual(["mpkv.ac.in"]);
  });
});
