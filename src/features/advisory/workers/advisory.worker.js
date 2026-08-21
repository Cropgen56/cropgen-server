import FarmField from "../../../models/field.model.js";
import FieldCrop from "../../../models/field-crop.model.js";
import UserSubscription from "../../../models/user-subscription.model.js";
import FarmAdvisory from "../models/farmAdvisory.model.js";
import "../../../models/user.model.js";
import cron from "node-cron";

import { resolveAOIForFarm } from "../../../utils/weather/weather.utils.js";
import { isMaturityOrHarvestStage } from "../pipeline/advisoryContext.js";

import {
  getBaseTemperature,
  normalizeCropName,
} from "../../../utils/crop/growth/gddCalculator.js";

import {
  getCurrentWeather,
  getForecastWeather,
  getHistoricalWeatherWithFallback,
} from "../client/observearth.client.js";
import { formatDateISO } from "../utils/shared/helpers.js";
import { resolveCumulativeGDDForFarm } from "../utils/weather/gddFromWeatherSummary.js";
import {
  assembleWeatherSummary,
  buildWeatherSnapshot,
  shouldGenerateAdvisory,
} from "../utils/weather/weatherSnapshot.utils.js";
import { shouldGenerateBarrenLandAdvisory } from "../utils/agronomy/barrenLand/barrenLandScheduling.js";
import { dispatchAdvisoryGeneration } from "../services/advisoryDispatch.service.js";

export const CROP_GDD_THRESHOLDS = {
  wheat: 50,
  rice: 30,
  corn: 30,
  barley: 50,
  pearlmillet: 30,
  sorghum: 30,
  fingermillet: 30,
  soybean: 40,
  groundnut: 40,
  kidneybeansrajma: 45,
  chickpea: 50,
  greengram: 40,
  blackgram: 40,
  redgram: 45,
  lentil: 50,
  horsegram: 45,
  cowpealobia: 40,
  mustard: 45,
  sunflower: 35,
  sesame: 40,
  linseed: 45,
  castor: 35,
  safflower: 45,
  niger: 40,
  tomato: 25,
  chilli: 25,
  brinjal: 25,
  capsicum: 25,
  cucumber: 25,
  okra: 25,
  bittergourd: 25,
  bottlegourd: 25,
  spongegourd: 25,
  snakegourd: 25,
  pumpkin: 30,
  squashmelon: 30,
  summersquash: 30,
  watermelon: 30,
  muskmelon: 30,
  ashgourd: 30,
  longmelon: 30,
  onion: 40,
  garlic: 50,
  potato: 35,
  sweetpotato: 35,
  carrot: 45,
  beetroot: 45,
  radish: 40,
  turnip: 40,
  cabbage: 45,
  cauliflower: 45,
  broccoli: 45,
  lettuce: 35,
  spinach: 35,
  celery: 40,
  greenpeas: 40,
  banana: 35,
  papaya: 35,
  mango: 45,
  guava: 45,
  pomegranate: 40,
  grapes: 35,
  apple: 50,
  orange: 45,
  lemon: 40,
  sapota: 45,
  fig: 40,
  kiwi: 45,
  amla: 45,
  pineapple: 40,
  coconut: 50,
  arecanut: 50,
  rubber: 60,
  turmeric: 40,
  ginger: 40,
  coriander: 35,
  cumin: 35,
  fenugreekmethi: 35,
  blackpepper: 45,
  chillipepper: 25,
  cotton: 30,
  sugarcane: 45,
  jute: 40,
  tobacco: 35,
  beans: 30,
  mushroom: 30,
  tea: 40,
  coffee: 40,
  drumstick: 35,
  dragonfruit: 35,
  chia: 35,

  /* ===================== New crops (143-crop expansion) ===================== */
  oats: 45,
  rye: 50,
  triticale: 50,
  teff: 30,
  buckwheat: 30,
  amaranthgrain: 35,
  quinoa: 35,
  canolarapeseed: 45,
  hemp: 40,
  guarclusterbean: 40,
  sugarbeet: 40,
  pears: 45,
  peach: 40,
  nectarine: 40,
  plum: 40,
  apricot: 40,
  cherry: 40,
  avocado: 45,
  olive: 45,
  citrus: 45,
  tablegrapes: 35,
  winegrapes: 35,
  blueberry: 35,
  raspberry: 30,
  blackberry: 30,
  cranberry: 35,
  persimmon: 40,
  lychee: 45,
  rambutan: 45,
  durian: 50,
  jackfruit: 50,
  custardapple: 45,
  passionfruit: 35,
  starfruit: 40,
  datepalm: 55,
  cacaococoa: 45,
  vanilla: 40,
  oilpalm: 55,
  almond: 45,
  walnut: 50,
  cashew: 45,
  pistachio: 45,
  hazelnut: 45,
  chestnut: 45,
  brazilnut: 55,
  pinenut: 45,
  macadamianuts: 50,
  pecannuts: 50,
  lucernealfalfa: 35,
  berseem: 35,
  covercrop: 30,
  feedsorghum: 30,
  napiergrass: 30,

  default: 30,
};

const ADVISORY_CRON = process.env.ADVISORY_CRON || "0 4 * * *";
const ADVISORY_WORKER_CONCURRENCY = Math.max(
  1,
  Number(process.env.ADVISORY_WORKER_CONCURRENCY) || 2,
);
let advisoryRunInProgress = false;

async function processWithConcurrency(items, concurrency, handler) {
  const inFlight = new Set();
  for (const item of items) {
    const task = Promise.resolve().then(() => handler(item));
    inFlight.add(task);
    task.finally(() => inFlight.delete(task));
    if (inFlight.size >= concurrency) {
      await Promise.race(inFlight);
    }
  }
  await Promise.allSettled([...inFlight]);
}

/** Barren-land re-advisory check (farm has no active crop right now). */
async function runBarrenLandCheck({ farm, aoiId, language }) {
  const lastAdvisory = await FarmAdvisory.findOne({
    farmFieldId: farm._id,
  }).sort({ createdAt: -1 });

  if (!lastAdvisory) {
    await dispatchAdvisoryGeneration({ farmFieldId: farm._id, aoiId, language });
    return;
  }

  const [currentWeatherResp, forecastWeather] = await Promise.all([
    getCurrentWeather(aoiId),
    getForecastWeather(aoiId),
  ]);
  const weatherSummary = assembleWeatherSummary(currentWeatherResp, forecastWeather);
  const currentSnapshot = buildWeatherSnapshot(weatherSummary);
  const expectedSowingISO = formatDateISO(farm.sowingDate || new Date());

  const barrenDecision = shouldGenerateBarrenLandAdvisory({
    lastAdvisory,
    currentSnapshot,
    expectedSowingDateISO: expectedSowingISO,
  });

  if (!barrenDecision.generate) return;

  await dispatchAdvisoryGeneration({ farmFieldId: farm._id, aoiId, language });
}

/**
 * Growth-stage-gated re-advisory check for one active crop instance. Also
 * opportunistically auto-retires seasonal crops that have reached
 * maturity/harvest (reusing the same signal the pipeline itself uses),
 * ahead of the date-based `expectedEndDate` fallback run at the top of the
 * cron job.
 */
async function runCropCheck({ farm, crop, aoiId, language }) {
  const lastAdvisory = await FarmAdvisory.findOne({
    farmFieldId: farm._id,
    cropInstanceId: crop._id,
  }).sort({ createdAt: -1 });

  if (!lastAdvisory) {
    await dispatchAdvisoryGeneration({
      farmFieldId: farm._id,
      aoiId,
      language,
      cropInstanceId: crop._id,
    });
    return;
  }

  if (
    crop.cropLifecycleType === "seasonal" &&
    isMaturityOrHarvestStage(lastAdvisory.plantGrowthActivity)
  ) {
    crop.isActive = false;
    crop.actualEndDate = new Date();
    await crop.save();
    console.log(
      `[Advisory] auto-deactivated seasonal crop ${crop._id} (${crop.cropName}) on farm ${farm._id}: reached maturity/harvest`,
    );
    return;
  }

  const baseTemp = getBaseTemperature(crop.cropName);
  const sowingDateISO = formatDateISO(crop.startDate || new Date());

  const { data: weatherTillNow } = await getHistoricalWeatherWithFallback(
    aoiId,
    sowingDateISO,
    formatDateISO(new Date()),
    { preferShortWindows: false },
  );

  const gddNow = await resolveCumulativeGDDForFarm({
    aoiId,
    historicalWeather: weatherTillNow,
    sowingDateISO,
    baseTemp,
    cropName: crop.cropName,
    getCurrentWeather,
    getForecastWeather,
    assembleWeatherSummary,
  });

  const currentCumulativeGDD = gddNow.cumulativeGDD;
  const lastAdvisoryGDD = lastAdvisory.plantGrowthActivity?.cumulativeGDD || 0;
  const gddDelta = currentCumulativeGDD - lastAdvisoryGDD;
  const cropKey = normalizeCropName(crop.cropName);
  const threshold = CROP_GDD_THRESHOLDS[cropKey] || CROP_GDD_THRESHOLDS.default;

  let currentSnapshot = null;
  if (gddDelta < threshold) {
    const [currentWeatherResp, forecastWeather] = await Promise.all([
      getCurrentWeather(aoiId),
      getForecastWeather(aoiId),
    ]);
    const weatherSummary = assembleWeatherSummary(currentWeatherResp, forecastWeather);
    currentSnapshot = buildWeatherSnapshot(weatherSummary);
  }

  const decision = shouldGenerateAdvisory({
    gddDelta,
    threshold,
    lastAdvisory,
    currentSnapshot,
  });

  if (!decision.generate) return;

  await dispatchAdvisoryGeneration({
    farmFieldId: farm._id,
    aoiId,
    language,
    cropInstanceId: crop._id,
  });
}

export const runAdvisoryJob = async () => {
  cron.schedule(ADVISORY_CRON, async () => {
    if (advisoryRunInProgress) {
      console.warn("[Advisory] cron skipped: previous run still in progress");
      return;
    }
    advisoryRunInProgress = true;
    try {
      // Multi-crop: seasonal crops past their expected harvest date auto-retire,
      // independent of (and as a safety net alongside) the growth-stage-based
      // maturity check further down. Perennial crops are untouched — they stay
      // active until a farmer manually retires them.
      const expiredSeasonalResult = await FieldCrop.updateMany(
        {
          cropLifecycleType: "seasonal",
          isActive: true,
          expectedEndDate: { $lt: new Date() },
        },
        { $set: { isActive: false, actualEndDate: new Date() } },
      );
      if (expiredSeasonalResult.modifiedCount) {
        console.log(
          `[Advisory] auto-deactivated ${expiredSeasonalResult.modifiedCount} seasonal crop(s) past their expected end date`,
        );
      }

      const subscriptions = await UserSubscription.find({
        status: "active",
        $or: [{ endDate: null }, { endDate: { $gte: new Date() } }],
      })
        .select("fieldId planId")
        .populate("planId", "brand features");

      const fieldIdSet = new Set();
      for (const s of subscriptions) {
        if (!s.fieldId) continue;
        const plan = s.planId;
        if (plan?.brand === "aat" && !plan.features?.smartAdvisorySystem) {
          continue;
        }
        fieldIdSet.add(String(s.fieldId));
      }

      const fieldIds = [...fieldIdSet];
      if (!fieldIds.length) {
        return;
      }

      console.log(
        `[Advisory] cron processing ${fieldIds.length} subscribed farm(s) (all orgs; AAT Starter excluded)`,
      );

      const farms = await FarmField.find({
        _id: { $in: fieldIds },
      }).populate("user");

      await processWithConcurrency(
        farms,
        ADVISORY_WORKER_CONCURRENCY,
        async (farm) => {
          try {
            if (!farm.user) return;

            const { aoiId } = await resolveAOIForFarm(farm);
            const language = farm.user.language || "en";

            const activeCrops = await FieldCrop.find({
              farmField: farm._id,
              isActive: true,
            });

            if (!activeCrops.length) {
              // Nothing currently growing — including a farm that just lost
              // its last active crop (harvested/removed) but is still
              // flagged non-barren; treat it as barren going forward.
              if (!farm.isBarrenLand) {
                farm.isBarrenLand = true;
                await farm.save();
              }
              await runBarrenLandCheck({ farm, aoiId, language });
              return;
            }

            for (const crop of activeCrops) {
              await runCropCheck({ farm, crop, aoiId, language });
            }
          } catch (err) {
            console.error("Advisory farm failed:", farm._id, err.message);
          }
        },
      );
    } catch (error) {
      console.error("Advisory job failed:", error);
    } finally {
      advisoryRunInProgress = false;
    }
  });
};
