import { rankRecords, scoreRecord } from "../features/agent/tools/knowledgeRecordTool.js";

const rec = (o) => ({ region: { state: "ALL", district: "ALL" }, growthStage: "ALL", confidence: "medium", ...o });

describe("knowledge record ranking", () => {
  const general = rec({ recordId: "g" });
  const state = rec({ recordId: "s", region: { state: "Maharashtra", district: "ALL" } });
  const district = rec({ recordId: "d", region: { state: "Maharashtra", district: "Sangli" } });
  const staged = rec({ recordId: "st", growthStage: "vegetative" });

  test("district beats state beats general", () => {
    const out = rankRecords([general, state, district], { state: "maharashtra", district: "SANGLI" });
    expect(out.map((r) => r.recordId)).toEqual(["d", "s", "g"]);
  });
  test("other-region records are excluded", () => {
    expect(rankRecords([state, district], { state: "Gujarat", district: "Surat" })).toEqual([]);
  });
  test("region-specific records need a known region", () => {
    expect(scoreRecord(state, {})).toBe(-1);
  });
  test("stage-specific records: unknown stage keeps them, wrong stage drops them", () => {
    expect(scoreRecord(staged, {})).toBeGreaterThan(0);
    expect(scoreRecord(staged, { growthStage: "harvest" })).toBe(-1);
    expect(scoreRecord(staged, { growthStage: "Vegetative growth" })).toBeGreaterThan(0);
  });

  test("zone records apply only to listed districts", () => {
    const zone = rec({ recordId: "z", region: { state: "Maharashtra", district: "ALL", districts: ["Parbhani", "Latur"] } });
    expect(scoreRecord(zone, { state: "Maharashtra", district: "PARBHANI" })).toBeGreaterThan(0);
    expect(scoreRecord(zone, { state: "Maharashtra", district: "Sangli" })).toBe(-1);
    expect(scoreRecord(zone, { state: "Maharashtra" })).toBe(-1);
  });
});
