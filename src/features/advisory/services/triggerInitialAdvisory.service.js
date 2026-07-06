import FarmField from "../../../models/field.model.js";
import User from "../../../models/user.model.js";
import { resolveAOIForFarm } from "../../../utils/weather/weather.utils.js";
import { generateAdvisoryForField } from "./advisory.service.js";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const GENERATION_TIMEOUT_MS =
  Number(process.env.ADVISORY_INITIAL_GENERATION_TIMEOUT_MS) || 150_000;

function withTimeout(promise, ms, label) {
  let timer = null;
  return Promise.race([
    promise.finally(() => {
      if (timer) clearTimeout(timer);
    }),
    new Promise((_, reject) => {
      timer = setTimeout(
        () =>
          reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s`)),
        ms,
      );
    }),
  ]);
}

/**
 * Generate the first advisory after a new farm field is saved.
 * Retries when AOI was just created (weather APIs may lag).
 */
export async function triggerInitialAdvisoryForNewField(
  farmFieldId,
  { language: languageOverride, userId } = {},
) {
  const farmFieldIdStr = String(farmFieldId);

  try {
    const farm = await FarmField.findById(farmFieldId).populate(
      "user",
      "language firstName email phone",
    );

    if (!farm) {
      console.error(`[Advisory] Initial trigger: farm not found ${farmFieldIdStr}`);
      return { ok: false, error: "farm_not_found" };
    }

    let farmer = farm.user;
    if (!farmer && userId) {
      farmer = await User.findById(userId).select(
        "language firstName email phone",
      );
    }

    if (!farmer) {
      console.error(
        `[Advisory] Initial trigger: no user linked to farm ${farmFieldIdStr}`,
      );
      return { ok: false, error: "user_not_found" };
    }

    if (!Array.isArray(farm.field) || farm.field.length < 3) {
      console.error(
        `[Advisory] Initial trigger: invalid boundary on farm ${farmFieldIdStr}`,
      );
      return { ok: false, error: "invalid_field_boundary" };
    }

    const { aoiId, created } = await resolveAOIForFarm(farm);
    if (created) {
      await sleep(6000);
    }

    const language = languageOverride || farmer.language || "en";
    const maxAttempts = created ? 3 : 2;
    const deadlineAt = Date.now() + GENERATION_TIMEOUT_MS;
    let lastError = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const attemptStartedAt = Date.now();
        const remainingMs = deadlineAt - Date.now();
        if (remainingMs <= 0) {
          throw new Error(
            `Advisory generation timed out after ${Math.round(
              GENERATION_TIMEOUT_MS / 1000,
            )}s`,
          );
        }
        const advisory = await withTimeout(
          generateAdvisoryForField(farm._id, aoiId, language, "whatsapp", {
            preferShortHistoricalWindow: created,
            lightweight: created,
          }),
          remainingMs,
          "Advisory generation",
        );

        console.log(
          `[Advisory] Initial trigger success for farm ${farmFieldIdStr} attempt ${attempt}/${maxAttempts} in ${Date.now() - attemptStartedAt}ms`,
        );

        return { ok: true, advisoryId: String(advisory._id) };
      } catch (err) {
        lastError = err;
        const detail = err.response?.data
          ? JSON.stringify(err.response.data).slice(0, 300)
          : err.message;
        console.warn(
          `[Advisory] Initial trigger attempt ${attempt}/${maxAttempts} failed for farm ${farmFieldIdStr}:`,
          detail,
        );
        if (attempt < maxAttempts) {
          await sleep(2000 * attempt);
        }
      }
    }

    console.error(
      `[Advisory] Initial trigger gave up for farm ${farmFieldIdStr}:`,
      lastError?.message || lastError,
    );
    return {
      ok: false,
      error: lastError?.message || "advisory_generation_failed",
    };
  } catch (err) {
    console.error(
      `[Advisory] Initial trigger fatal error for farm ${farmFieldIdStr}:`,
      err?.message || err,
    );
    return { ok: false, error: err?.message || "unknown_error" };
  }
}
