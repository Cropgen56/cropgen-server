import { jest } from "@jest/globals";

process.env.OBSERVEARTH_API_KEY = "test-key"; // weather.utils reads the key at call time

const getMock = jest.fn();
const postMock = jest.fn();

jest.unstable_mockModule("axios", () => ({
  default: { create: () => ({ get: getMock, post: postMock }) },
}));

const findOneAndUpdate = jest.fn();
const updateOne = jest.fn();
const findById = jest.fn();
jest.unstable_mockModule("../../../models/field.model.js", () => ({
  default: { findOneAndUpdate, updateOne, findById },
}));

const { resolveAOIForFarm } = await import("../weather.utils.js");

const farmId = "6a2070ad7ed524411dd1a336";
const field = [{ lng: 77.0, lat: 18.0 }, { lng: 77.001, lat: 18.0 }, { lng: 77.001, lat: 18.001 }, { lng: 77.0, lat: 18.001 }];
const selectMock = (value) => ({ select: () => Promise.resolve(value) });

function httpError(status, data = {}) {
  const err = new Error(`status ${status}`);
  err.response = { status, data };
  return err;
}

beforeEach(() => {
  getMock.mockReset();
  postMock.mockReset();
  findOneAndUpdate.mockReset();
  updateOne.mockReset();
  findById.mockReset();
});

describe("resolveAOIForFarm: stored AOI check", () => {
  test("keeps a stored AOI that still exists, without creating anything", async () => {
    getMock.mockResolvedValueOnce({ status: 200, data: { id: "aoi-1" } });

    const result = await resolveAOIForFarm({ _id: farmId, field, weatherAoiId: "aoi-1" });

    expect(result).toEqual({ aoiId: "aoi-1", created: false });
    expect(postMock).not.toHaveBeenCalled();
    expect(updateOne).not.toHaveBeenCalled();
  });

  test("clears a stored AOI deleted on ObservEarth and creates a new one", async () => {
    getMock
      .mockRejectedValueOnce(httpError(500, { error: "No Geometry matches the given query." }))
      .mockRejectedValueOnce(httpError(500, { error: "No Geometry matches the given query." })) // withAoiRetry second attempt
      .mockResolvedValueOnce({ data: [] }); // AOI list: no match for this farm
    postMock.mockResolvedValueOnce({ data: { id: "aoi-new" } });
    findOneAndUpdate.mockReturnValueOnce(selectMock({ weatherAoiId: "aoi-new" }));

    const result = await resolveAOIForFarm({ _id: farmId, field, weatherAoiId: "aoi-gone" });

    expect(updateOne).toHaveBeenCalledWith(
      { _id: farmId, weatherAoiId: "aoi-gone" },
      { $set: { weatherAoiId: null } },
    );
    expect(postMock).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ aoiId: "aoi-new", created: true });
  });

  test("if the check fails for another reason, keeps the stored AOI instead of creating a duplicate", async () => {
    getMock.mockRejectedValue(new Error("socket hang up"));

    const result = await resolveAOIForFarm({ _id: farmId, field, weatherAoiId: "aoi-1" });

    expect(result).toEqual({ aoiId: "aoi-1", created: false });
    expect(postMock).not.toHaveBeenCalled();
    expect(updateOne).not.toHaveBeenCalled();
  });
});
