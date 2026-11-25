import { jest } from "@jest/globals";
import {
  createRateLimiter,
  isSesRateThrottle,
  sendWithThrottleRetry,
} from "../sesSendRate.js";

/** Fake clock: sleep advances time instantly. */
function fakeClock() {
  let t = 0;
  return {
    now: () => t,
    sleep: async (ms) => {
      t += ms;
    },
  };
}

function throttled(message = "Maximum sending rate exceeded.") {
  return Object.assign(new Error(message), { code: "Throttled" });
}

describe("createRateLimiter", () => {
  test("spaces calls 1000/rate ms apart", async () => {
    const clock = fakeClock();
    const acquire = createRateLimiter(10, clock);
    const times = [];
    for (let i = 0; i < 5; i++) {
      await acquire();
      times.push(clock.now());
    }
    expect(times).toEqual([0, 100, 200, 300, 400]);
  });

  test("is shared across concurrent batches: 5 parallel loops still total 10/s", async () => {
    const clock = fakeClock();
    // Real timers would interleave; simulate by reserving slots concurrently.
    const sleeps = [];
    const acquire = createRateLimiter(10, {
      now: clock.now,
      sleep: async (ms) => sleeps.push(ms),
    });
    await Promise.all(Array.from({ length: 50 }, () => acquire()));
    // 50 sends at 10/s: the last one waits 4.9s.
    expect(Math.max(...sleeps)).toBeCloseTo(4900);
    expect(sleeps).toHaveLength(49);
  });
});

describe("isSesRateThrottle", () => {
  test("matches send-rate throttles, not the daily quota or other errors", () => {
    expect(isSesRateThrottle(throttled())).toBe(true);
    expect(
      isSesRateThrottle(Object.assign(new Error("x"), { name: "Throttling" })),
    ).toBe(true);
    expect(isSesRateThrottle(throttled("Daily message quota exceeded."))).toBe(
      false,
    );
    expect(
      isSesRateThrottle(
        Object.assign(new Error("not verified"), { code: "EmailNotVerified" }),
      ),
    ).toBe(false);
  });
});

describe("sendWithThrottleRetry", () => {
  test("retries a throttled send with backoff, then succeeds", async () => {
    const sleeps = [];
    const send = jest
      .fn()
      .mockRejectedValueOnce(throttled())
      .mockRejectedValueOnce(throttled())
      .mockResolvedValueOnce({ MessageId: "m1" });
    const acquire = jest.fn(async () => {});

    const { result, attempts } = await sendWithThrottleRetry(send, {
      acquire,
      sleep: async (ms) => sleeps.push(ms),
    });

    expect(result).toEqual({ MessageId: "m1" });
    expect(attempts).toBe(3);
    expect(sleeps).toEqual([1000, 2000]);
    // Every attempt, including retries, goes through the rate limiter.
    expect(acquire).toHaveBeenCalledTimes(3);
  });

  test("gives up after maxAttempts and reports attempts on the error", async () => {
    const send = jest.fn().mockRejectedValue(throttled());
    await expect(
      sendWithThrottleRetry(send, { maxAttempts: 4, sleep: async () => {} }),
    ).rejects.toMatchObject({ code: "Throttled", attempts: 4 });
    expect(send).toHaveBeenCalledTimes(4);
  });

  test("does not retry non-throttle errors or the daily quota", async () => {
    const notVerified = Object.assign(new Error("not verified"), {
      code: "EmailNotVerified",
    });
    const send1 = jest.fn().mockRejectedValue(notVerified);
    await expect(
      sendWithThrottleRetry(send1, { sleep: async () => {} }),
    ).rejects.toMatchObject({ attempts: 1 });
    expect(send1).toHaveBeenCalledTimes(1);

    const send2 = jest
      .fn()
      .mockRejectedValue(throttled("Daily message quota exceeded."));
    await expect(
      sendWithThrottleRetry(send2, { sleep: async () => {} }),
    ).rejects.toMatchObject({ attempts: 1 });
    expect(send2).toHaveBeenCalledTimes(1);
  });
});
