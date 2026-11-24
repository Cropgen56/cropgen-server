import { buildFarmerContext, normalizeStateCode, describeFarmerContextForPrompt, mentionsIndianState } from "../features/agent/utils/farmerContext.js";
import { validateProfileInput } from "../features/agent/tools/profileTool.js";

describe("normalizeStateCode", () => {
  test.each([["Maharashtra","MH"],["MH","MH"],["tamil nadu","TN"],["TAMILNADU","TN"],["Telangana","TG"],["TS","TG"],["Kerala","KL"]])("%s -> %s",(i,o)=>expect(normalizeStateCode(i)).toBe(o));
  test("unknown -> null", () => { expect(normalizeStateCode("Atlantis")).toBeNull(); expect(normalizeStateCode("")).toBeNull(); });
});

describe("buildFarmerContext", () => {
  const farm = { fieldName: "F1", acre: 2, cropName: "Turmeric", sowingDate: "2026-09-01" };
  test("no farm", () => {
    const c = buildFarmerContext({}, []);
    expect(c.farmerState).toBe("NO_FARM");
    expect(c.profileMissing).toEqual(["state", "district"]);
  });
  test("farm but location missing -> incomplete", () => {
    expect(buildFarmerContext({}, [farm]).farmerState).toBe("FARM_INCOMPLETE");
  });
  test("farm missing sowing date", () => {
    const c = buildFarmerContext({ state: "MH", district: "SANGLI" }, [{ ...farm, sowingDate: null }]);
    expect(c.farmerState).toBe("FARM_INCOMPLETE");
    expect(c.farmMissing[0]).toMatch(/sowing/);
  });
  test("complete", () => {
    expect(buildFarmerContext({ state: "MH", district: "SANGLI" }, [farm]).farmerState).toBe("FARM_COMPLETE");
  });
  test("multi-crop uses crops array", () => {
    const f = { fieldName: "F2", acre: 1, crops: [{ cropName: "Soy", startDate: new Date() }] };
    expect(buildFarmerContext({ state: "MH", district: "X" }, [f]).farmerState).toBe("FARM_COMPLETE");
  });
  test("prompt block mentions save tool only when profile missing", () => {
    expect(describeFarmerContextForPrompt(buildFarmerContext({}, []))).toMatch(/save_profile_details/);
    expect(describeFarmerContextForPrompt(buildFarmerContext({ state: "MH", district: "X" }, [farm]))).not.toMatch(/save_profile_details/);
  });
});

describe("validateProfileInput", () => {
  test("normalizes", () => {
    expect(validateProfileInput({ state: "Maharashtra", district: "Sangli", village: "Miraj" }).out)
      .toEqual({ state: "MH", district: "SANGLI", village: "Miraj" });
  });
  test("rejects bad state and injection-like input", () => {
    expect(validateProfileInput({ state: "Narnia" }).errors.length).toBe(1);
    expect(validateProfileInput({ district: "x'; drop" }).errors.length).toBe(1);
    expect(validateProfileInput({ district: "A".repeat(40) }).errors.length).toBe(1);
  });
});

import { withholdUnsourcedDoses } from "../features/agent/tools/cropKnowledgeTool.js";
describe("withholdUnsourcedDoses", () => {
  test("redacts doses in nested data, keeps names and timing", () => {
    const out = JSON.stringify(withholdUnsourcedDoses({
      fertilizers: [{ name: "Urea", dosage: "25 kg/acre (split doses)" }],
      applicationMethods: "Apply 150 qtl/acre of FYM at 75 days after planting; 2.5 g/l spray; 10–15 tonnes per hectare",
    }));
    expect(out).not.toMatch(/25 kg|150 qtl|2\.5 g|10–15/);
    expect(out).toMatch(/Urea/);
    expect(out).toMatch(/75 days/);
  });
});

import { scoreRecord } from "../features/agent/tools/knowledgeRecordTool.js";
describe("state spelling does not break matching", () => {
  const r = { region: { state: "MH", district: "ALL" }, growthStage: "ALL", confidence: "high" };
  test.each(["MH", "Maharashtra", "MAHARASHTRA"])("%s matches MH records", (st) => {
    expect(scoreRecord(r, { state: st })).toBeGreaterThan(0);
  });
  test("other state does not", () => expect(scoreRecord(r, { state: "Gujarat" })).toBe(-1));
});

describe("mentionsIndianState", () => {
  test("finds states in sentences", () => {
    expect(mentionsIndianState("I am from Maharashtra Yavatmal")).toBe(true);
    expect(mentionsIndianState("my farm is in tamil nadu")).toBe(true);
    expect(mentionsIndianState("Give me a fertilizer schedule. I am in Sangli, Maharashtra.")).toBe(true);
  });
  test("ignores ordinary text and short words", () => {
    expect(mentionsIndianState("How is my turmeric crop doing")).toBe(false);
    expect(mentionsIndianState("I want to go in or out")).toBe(false);
    expect(mentionsIndianState("")).toBe(false);
  });
});
