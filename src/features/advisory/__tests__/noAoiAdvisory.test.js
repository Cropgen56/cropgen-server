import { jest } from "@jest/globals";

const dispatch = jest.fn();
jest.unstable_mockModule("../services/advisoryDispatch.service.js", () => ({
  dispatchAdvisoryGeneration: dispatch,
}));

let lastAdvisory = null;
jest.unstable_mockModule("../models/farmAdvisory.model.js", () => ({
  default: {
    findOne: () => ({ sort: () => Promise.resolve(lastAdvisory) }),
  },
}));

const { runCropCheck, runBarrenLandCheck } = await import("../workers/advisory.worker.js");

const DAY = 86400000;
const ago = (days) => new Date(Date.now() - days * DAY - 60_000);
const farm = { _id: "farm-1", isBarrenLand: false, sowingDate: new Date() };
const crop = { _id: "crop-1", cropName: "tobacco", cropLifecycleType: "seasonal" };

beforeEach(() => {
  dispatch.mockReset();
  lastAdvisory = null;
});

describe("crop farm without an AOI", () => {
  test("generates the first advisory with no AOI", async () => {
    await runCropCheck({ farm, crop, aoiId: null, language: "en" });
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ farmFieldId: "farm-1", aoiId: null, cropInstanceId: "crop-1" }),
    );
  });

  test("does not regenerate before 2 days have passed", async () => {
    lastAdvisory = { createdAt: ago(1) };
    await runCropCheck({ farm, crop, aoiId: null, language: "en" });
    expect(dispatch).not.toHaveBeenCalled();
  });

  test("refreshes once 2 days have passed, still without an AOI", async () => {
    lastAdvisory = { createdAt: ago(2.5) };
    await runCropCheck({ farm, crop, aoiId: null, language: "en" });
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ aoiId: null }));
  });
});

describe("barren farm without an AOI", () => {
  test("generates the first advisory with no AOI", async () => {
    await runBarrenLandCheck({ farm, aoiId: null, language: "en" });
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ farmFieldId: "farm-1", aoiId: null }));
  });

  test("refreshes on the 2-day interval, without an AOI", async () => {
    lastAdvisory = { createdAt: ago(1) };
    await runBarrenLandCheck({ farm, aoiId: null, language: "en" });
    expect(dispatch).not.toHaveBeenCalled();

    lastAdvisory = { createdAt: ago(2.5) };
    await runBarrenLandCheck({ farm, aoiId: null, language: "en" });
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ aoiId: null }));
  });
});
