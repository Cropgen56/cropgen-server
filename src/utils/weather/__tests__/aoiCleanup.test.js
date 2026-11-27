import { selectAoisForCleanup, usageRatio } from "../aoiCleanup.js";

const FARM_A = "6a2070ad7ed524411dd1a336";
const FARM_B = "6a436821c5c7f78c3f61e9eb";
const GONE = "6af61425361c8d743a30aeef";

describe("selectAoisForCleanup", () => {
  test("keeps AOIs in use, flags duplicates and orphans, never touches manual names", () => {
    const aois = [
      { id: "in-use", name: `${FARM_A}-wx`, area: 1.5 },
      { id: "dup", name: FARM_A, area: 1.5 }, // farm A exists but uses "in-use"
      { id: "orphan", name: GONE, area: 1.49 }, // farm no longer exists
      { id: "manual", name: "Test", area: 1.5 },
      { id: "farm-b-aoi", name: FARM_B, area: 1.5 }, // farm B uses this one
    ];
    const inUseIds = new Set(["in-use", "farm-b-aoi"]);
    const farmIds = new Set([FARM_A, FARM_B]);

    const picked = selectAoisForCleanup({ aois, inUseIds, farmIds });

    expect(picked).toEqual([
      { id: "dup", name: FARM_A, area: 1.5, reason: "duplicate" },
      { id: "orphan", name: GONE, area: 1.49, reason: "orphan" },
    ]);
  });

  test("returns nothing when every AOI is in use", () => {
    const aois = [{ id: "a", name: FARM_A, area: 1 }];
    expect(
      selectAoisForCleanup({ aois, inUseIds: new Set(["a"]), farmIds: new Set([FARM_A]) }),
    ).toEqual([]);
  });
});

describe("usageRatio", () => {
  test("is usage over plan cap", () => {
    expect(usageRatio({ usageHa: 4000, planCapHa: 5000 })).toBeCloseTo(0.8);
  });

  test("is 0 when the plan cap is unknown", () => {
    expect(usageRatio({ usageHa: 4000, planCapHa: 0 })).toBe(0);
  });
});
