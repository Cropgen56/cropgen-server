import { formatDateISO, buildGeometryFromFarmField } from "../utils/shared/helpers.js";

/**
 * @typedef {Object} AdvisoryPipelineContext
 * @property {'crop' | 'barren'} mode
 * @property {string} farmFieldId
 * @property {string} geometryId
 * @property {string} language
 * @property {string} platform
 * @property {boolean} lightweight
 * @property {boolean} preferShortHistoricalWindow
 * @property {import('mongoose').Types.ObjectId | string} farmField
 * @property {Record<string, unknown>} farmFieldDoc
 * @property {string} nowISO
 * @property {string} sowingDateISO
 * @property {object | null} geometry
 * @property {Record<string, import('./moduleResult.js').moduleResult>} modules
 * @property {string[]} warnings
 * @property {string[]} errors
 * @property {(msg: string) => void} logStep
 * @property {object} [stash] internal cross-module cache
 */

/**
 * @param {object} params
 */
export function createAdvisoryContext({
  mode,
  farmField,
  geometryId,
  language,
  platform,
  lightweight = false,
  preferShortHistoricalWindow = false,
  logStep = () => {},
}) {
  const now = new Date();
  const nowISO = formatDateISO(now);
  const sowingDateISO = formatDateISO(farmField.sowingDate || now);

  return {
    mode,
    farmFieldId: String(farmField._id),
    geometryId,
    language: language || "en",
    platform: platform || "whatsapp",
    lightweight: Boolean(lightweight),
    preferShortHistoricalWindow: Boolean(preferShortHistoricalWindow),
    farmField: farmField._id,
    farmFieldDoc: farmField,
    nowISO,
    sowingDateISO,
    geometry: buildGeometryFromFarmField(farmField),
    modules: {},
    warnings: [],
    errors: [],
    logStep,
    stash: {},
  };
}

export function isMaturityOrHarvestStage(plantGrowthActivity) {
  const stageNameLower = (plantGrowthActivity?.stageName || "").toLowerCase();
  return (
    stageNameLower.includes("maturity") ||
    stageNameLower.includes("harvest") ||
    (plantGrowthActivity?.bbchStage ?? 0) >= 85
  );
}
