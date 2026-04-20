import FarmField from "../../../models/field.model.js";
import UserSubscription from "../../../models/usersubscription.model.js";
import FarmAdvisory from "../models/farmAdvisory.model.js";
import "../../../models/user.model.js";
import cron from "node-cron";

import { generateAdvisoryForField } from "../services/advisory.service.js";
import { resolveAOIForFarm } from "../../../utils/weather/weather.utils.js";

import {
  getBaseTemperature,
  calculateCumulativeGDD,
} from "../../../utils/cropgrowth/gddCalculator.js";

import { getHistoricalWeather } from "../clients/observearth.client.js";
import { formatDateISO } from "../utils/shared/helpers.js";

export const CROP_GDD_THRESHOLDS = {
  wheat: 50,
  rice: 30,
  corn: 30,
  barley: 50,
  pearlmillet: 30,
  sorghum: 30,
  fingermillet: 30,
  soybean: 40,
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
  default: 30,
};

export const runAdvisoryJob = async () => {
  cron.schedule("0 4 * * *", async () => {
    try {
      const subscriptions = await UserSubscription.find({
        status: "active",
        $or: [{ endDate: null }, { endDate: { $gte: new Date() } }],
      }).select("fieldId");

      if (!subscriptions.length) {
        console.log("No active subscriptions found");
        return;
      }

      const fieldIds = subscriptions.map((s) => s.fieldId);
      const farms = await FarmField.find({
        _id: { $in: fieldIds },
      }).populate("user");

      for (const farm of farms) {
        try {
          if (!farm.user) continue;

          const { aoiId } = await resolveAOIForFarm(farm);
          const language = farm.user.language || "en";

          const lastAdvisory = await FarmAdvisory.findOne({
            farmFieldId: farm._id,
          }).sort({ createdAt: -1 });

          if (!lastAdvisory) {
            console.log("First advisory for farm:", farm._id);
            await generateAdvisoryForField(farm._id, aoiId, language);
            continue;
          }

          const baseTemp = getBaseTemperature(farm.cropName);
          const sowingDateISO = formatDateISO(farm.sowingDate || new Date());

          const weatherTillNow = await getHistoricalWeather(
            aoiId,
            sowingDateISO,
            formatDateISO(new Date()),
          );

          const gddSeriesNow = calculateCumulativeGDD(
            weatherTillNow,
            baseTemp,
            sowingDateISO,
          );

          const currentCumulativeGDD = gddSeriesNow.at(-1)?.cumulativeGDD || 0;
          const lastAdvisoryGDD =
            lastAdvisory.plantGrowthActivity?.cumulativeGDD || 0;
          const gddDelta = currentCumulativeGDD - lastAdvisoryGDD;
          const threshold =
            CROP_GDD_THRESHOLDS[farm.cropName] || CROP_GDD_THRESHOLDS.default;

          if (gddDelta < threshold) {
            console.log("Skip farm:", farm._id, "| gddDelta:", gddDelta);
            continue;
          }

          console.log(
            "Generate advisory for farm:",
            farm._id,
            "| gddDelta:",
            gddDelta,
          );
          await generateAdvisoryForField(farm._id, aoiId, language);
        } catch (err) {
          console.error("Farm failed:", farm._id, err.message);
        }
      }

      console.log("Advisory job completed");
    } catch (error) {
      console.error("Advisory job failed:", error);
    }
  });
};
