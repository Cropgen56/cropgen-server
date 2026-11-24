import { analyzeTurn, extractToolEvents, hasUnsourcedDose } from "../features/agent/utils/turnAudit.js";

describe("analyzeTurn", () => {
  test("flags unsourced dose", () => {
    expect(analyzeTurn({ reply: "Apply 25 kg/acre urea" }).flags).toContain("unsourced_number");
  });
  test("sourced dose is not flagged", () => {
    const toolEvents = [{ name: "get_sourced_guidance", found: true, recordIds: ["R1"], numbers: [25] }];
    expect(analyzeTurn({ reply: "Apply 25 kg/acre urea", toolEvents }).flags).not.toContain("unsourced_number");
  });
  test("flags access disclaimer, fallback, reask, many questions", () => {
    const ctx = { known: { state: "MH", district: "SANGLI" } };
    const r = analyzeTurn({ reply: "I don't have access to weather. Which district are you in? a? b? c? d?", farmerContext: ctx, isFallback: true });
    expect(r.flags).toEqual(expect.arrayContaining(["access_disclaimer", "fallback_reply", "reasked_known_location", "too_many_questions"]));
  });
  test("profile_saved and no_sourced_record", () => {
    const f = analyzeTurn({ reply: "ok", toolEvents: [{ name: "save_profile_details", saved: true }, { name: "get_sourced_guidance", found: false }] }).flags;
    expect(f).toEqual(expect.arrayContaining(["profile_saved", "no_sourced_record"]));
  });
});

describe("extractToolEvents", () => {
  test("pairs call and output", () => {
    const ev = extractToolEvents([
      { type: "tool_call_item", rawItem: { name: "get_sourced_guidance", callId: "c1", arguments: "{}" } },
      { type: "tool_call_output_item", rawItem: { callId: "c1", name: "get_sourced_guidance" }, output: JSON.stringify({ found: true, records: [{ recordId: "R9" }] }) },
    ]);
    expect(ev[0]).toMatchObject({ name: "get_sourced_guidance", found: true, recordIds: ["R9"] });
  });
});

describe("hasUnsourcedDose", () => {
  const ev = (numbers) => [{ name: "get_sourced_guidance", found: true, numbers }];
  test("blocks a dose with no record", () => expect(hasUnsourcedDose("Use 2.5 grams per litre of water", [])).toBe(true));
  test("blocks bare amounts", () => expect(hasUnsourcedDose("you would need approximately 25 grams", [])).toBe(true));
  test("a record about something else does NOT license other doses", () => expect(hasUnsourcedDose("Use 2.5 grams per litre", ev([30, 40]))).toBe(true));
  test("allows the exact number from a record", () => expect(hasUnsourcedDose("Use 30 g per 10 litres", ev([30]))).toBe(false));
  test("range both ends must be sourced", () => {
    expect(hasUnsourcedDose("Use 10-15 g", ev([10, 15]))).toBe(false);
    expect(hasUnsourcedDose("Use 10-15 g", ev([10]))).toBe(true);
  });
  test("ignores non-dose text", () => expect(hasUnsourcedDose("Irrigate every 12-15 days, plough 18 cm deep", [])).toBe(false));
});
