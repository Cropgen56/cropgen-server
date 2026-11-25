/**
 * Per-email send pacing + throttle retry for the campaign email worker.
 *
 * BullMQ's `limiter` counts jobs, and each job is a batch of ~100 recipients,
 * so it never capped individual SES sends. This limiter is shared by every
 * batch running in this process, so total sends stay under the SES rate.
 */

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Returns `acquire()`; each call resolves at the next free slot, spacing
 * calls 1000/ratePerSecond ms apart across all callers.
 */
export function createRateLimiter(
  ratePerSecond,
  { now = () => Date.now(), sleep = defaultSleep } = {},
) {
  const intervalMs = 1000 / Math.max(0.1, ratePerSecond);
  let nextSlot = 0;

  return async function acquire() {
    const t = now();
    const slot = Math.max(t, nextSlot);
    nextSlot = slot + intervalMs;
    const wait = slot - t;
    if (wait > 0) await sleep(wait);
  };
}

/**
 * SES "Maximum sending rate exceeded" / throttling. The daily quota error is
 * also reported as throttling, but retrying within seconds can't fix it.
 */
export function isSesRateThrottle(err) {
  const msg = String(err?.message || "");
  if (/daily message quota/i.test(msg)) return false;
  return (
    err?.code === "Throttled" ||
    /Throttl/i.test(err?.name || "") ||
    /maximum sending rate exceeded/i.test(msg)
  );
}

/**
 * Paces each attempt through `acquire` and retries rate throttles with
 * exponential backoff. Resolves { result, attempts }; on final failure the
 * error is thrown with `err.attempts` set.
 */
export async function sendWithThrottleRetry(
  send,
  {
    acquire,
    maxAttempts = 4,
    baseDelayMs = 1000,
    sleep = defaultSleep,
  } = {},
) {
  for (let attempt = 1; ; attempt++) {
    if (acquire) await acquire();
    try {
      const result = await send();
      return { result, attempts: attempt };
    } catch (err) {
      if (attempt >= maxAttempts || !isSesRateThrottle(err)) {
        err.attempts = attempt;
        throw err;
      }
      await sleep(baseDelayMs * 2 ** (attempt - 1));
    }
  }
}
