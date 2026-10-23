import mongoose from "mongoose";
import FarmField from "../../../models/field.model.js";
import FieldCrop from "../../../models/field-crop.model.js";
import User from "../../../models/user.model.js";
import FarmAdvisory from "../models/farmAdvisory.model.js";
import { resolveAOIForFarm } from "../../../utils/weather/weather.utils.js";
import { normalizeAdvisoryLanguage } from "../utils/i18n/advisoryLanguages.js";
import { dispatchAdvisoryGeneration } from "./advisoryDispatch.service.js";

/**
 * The farmer's current advisory (latest per farm + crop instance) is stored
 * text in the language it was generated in. After a language change, regenerate
 * each one that is not already in the new language so the app shows the
 * advisory in that language without waiting for the next scheduled run.
 *
 * Runs without farmer notifications — a language switch is not new advice.
 * Stops early if the user changes language again mid-run (the newer run takes over).
 */
export async function regenerateAdvisoriesForLanguageChange(userId, language) {
  const lang = normalizeAdvisoryLanguage(language);
  const userIdStr = String(userId);
  let regenerated = 0;
  let failed = 0;

  const farms = await FarmField.find({ user: userId });

  for (const farm of farms) {
    const latestPerCrop = await FarmAdvisory.aggregate([
      { $match: { farmFieldId: new mongoose.Types.ObjectId(String(farm._id)) } },
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: "$cropInstanceId",
          language: { $first: "$language" },
        },
      },
    ]);
    if (!latestPerCrop.length) continue;

    const cropGroups = latestPerCrop.filter((g) => g._id);
    const activeCropIds = new Set(
      (
        await FieldCrop.find({
          _id: { $in: cropGroups.map((g) => g._id) },
          farmField: farm._id,
          isActive: true,
        }).select("_id")
      ).map((c) => String(c._id)),
    );

    // Crop-specific advisories for crops still growing; the farm-level
    // (legacy / barren) advisory only when the farm has no crop-specific ones.
    const targets = cropGroups
      .filter((g) => activeCropIds.has(String(g._id)))
      .filter((g) => normalizeAdvisoryLanguage(g.language) !== lang)
      .map((g) => String(g._id));
    const farmLevel = latestPerCrop.find((g) => !g._id);
    if (
      !cropGroups.length &&
      farmLevel &&
      normalizeAdvisoryLanguage(farmLevel.language) !== lang
    ) {
      targets.push(null);
    }
    if (!targets.length) continue;

    let aoiId;
    try {
      ({ aoiId } = await resolveAOIForFarm(farm));
    } catch (err) {
      failed += targets.length;
      console.error(
        `[Advisory] language regen: AOI failed for farm ${farm._id}:`,
        err?.message || err,
      );
      continue;
    }

    for (const cropInstanceId of targets) {
      const current = await User.findById(userId).select("language").lean();
      if (normalizeAdvisoryLanguage(current?.language) !== lang) {
        console.log(
          `[Advisory] language regen for user ${userIdStr} superseded (now ${current?.language}); stopping ${lang} run`,
        );
        return { language: lang, regenerated, failed, superseded: true };
      }

      try {
        await dispatchAdvisoryGeneration({
          farmFieldId: farm._id,
          aoiId,
          language: lang,
          options: { notify: false },
          cropInstanceId,
          jobId: `advisory-lang:${farm._id}:${cropInstanceId || "primary"}:${lang}:${Date.now()}`,
        });
        regenerated++;
      } catch (err) {
        failed++;
        console.error(
          `[Advisory] language regen failed for farm ${farm._id}${cropInstanceId ? ` crop ${cropInstanceId}` : ""}:`,
          err?.message || err,
        );
      }
    }
  }

  console.log(
    `[Advisory] language regen for user ${userIdStr} → ${lang}: ${regenerated} dispatched, ${failed} failed`,
  );
  return { language: lang, regenerated, failed, superseded: false };
}
