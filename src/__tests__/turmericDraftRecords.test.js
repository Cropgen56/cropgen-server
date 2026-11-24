import fs from "node:fs";
import { rankRecords } from "../features/agent/tools/knowledgeRecordTool.js";

const rows = JSON.parse(fs.readFileSync(new URL("../../data/turmeric-marathwada-2016.draft.json", import.meta.url), "utf8"));

describe("turmeric Marathwada draft records", () => {
  test("unique ids, cited, still draft", () => {
    expect(new Set(rows.map((r) => r.recordId)).size).toBe(rows.length);
    for (const r of rows) {
      expect(r.status).toBe("draft");
      expect(r.source.pageOrSection).toMatch(/p\. \d+/);
      expect(r.source.yearOrVersion).toBeTruthy();
      if (r.numericValue != null) { expect(r.numericUnit).toBeTruthy(); expect(r.calculationBasis).toBeTruthy(); }
    }
  });
  const approved = rows.map((r) => ({ ...r, status: "approved" }));
  test("applies in Parbhani, never in Sangli", () => {
    expect(rankRecords(approved, { state: "MH", district: "Parbhani" }).length).toBeGreaterThan(0);
    expect(rankRecords(approved, { state: "MH", district: "Sangli" })).toEqual([]);
    expect(rankRecords(approved, { state: "MH" })).toEqual([]);
  });
});
