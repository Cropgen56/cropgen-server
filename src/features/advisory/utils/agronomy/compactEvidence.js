/**
 * Slim evidence payload for LLM — keeps agronomic facts, drops bulky nested data.
 */
export function buildCompactEvidence(evidence) {
  if (!evidence) return {};

  const hints = evidence.decisionHints || {};
  const stress = evidence.stressZones || {};

  return {
    cropType: evidence.cropType,
    variety: evidence.variety,
    acre: evidence.acre,
    typeOfFarming: evidence.typeOfFarming,
    cropGrowthStage: evidence.cropGrowthStage,
    bbchStage: evidence.bbchStage,
    isHarvestStage: evidence.isHarvestStage,
    cropHealth: evidence.cropHealth,
    soilMoisture: evidence.soilMoisture,
    irrigationType: evidence.irrigationType,
    irrigationRequirement: evidence.irrigationRequirement,
    nutrientDeficit: evidence.nutrientDeficit,
    weatherForecast: {
      current: evidence.weatherForecast?.current,
      rainProbabilityToday: evidence.weatherForecast?.rainProbabilityToday,
      rainfallForecast3d: evidence.weatherForecast?.rainfallForecast3d,
      rainfallForecast7d: evidence.weatherForecast?.rainfallForecast7d,
      windSpeedToday: evidence.weatherForecast?.windSpeedToday,
      next7Days: evidence.weatherForecast?.next7Days
        ? {
            dates: evidence.weatherForecast.next7Days.dates,
            tempMax: evidence.weatherForecast.next7Days.tempMax,
            tempMin: evidence.weatherForecast.next7Days.tempMin,
            rainfall: evidence.weatherForecast.next7Days.rainfall,
            humidity: evidence.weatherForecast.next7Days.humidity,
          }
        : null,
    },
    npkManagement: evidence.npkManagement,
    fertilizerSchedule: evidence.fertilizerSchedule
      ? {
          summary: evidence.fertilizerSchedule.summary,
          currentApplication: evidence.fertilizerSchedule.currentApplication,
        }
      : null,
    stressZones: {
      zones: stress.zones,
      percentageWaterStressed: stress.percentageWaterStressed,
      percentageNitrogenDeficient: stress.percentageNitrogenDeficient,
      diseasePressure: stress.diseasePressure,
    },
    satelliteOpticalIndices: evidence.satelliteOpticalIndices
      ? {
          snapshotDate: evidence.satelliteOpticalIndices.snapshotDate,
          compositeVegetationScore:
            evidence.satelliteOpticalIndices.compositeVegetationScore,
          indices: Object.fromEntries(
            Object.entries(evidence.satelliteOpticalIndices.indices || {}).map(
              ([k, v]) => [
                k,
                v?.healthScore != null
                  ? {
                      healthScore: v.healthScore,
                      dominantLabel: v.dominantLabel,
                      cloudCoverPercent: v.cloudCoverPercent,
                    }
                  : v,
              ],
            ),
          ),
        }
      : null,
    carbonData: evidence.carbonData,
    yieldGap: evidence.yieldGap,
    dataQuality: evidence.dataQuality,
    decisionHints: hints,
  };
}
