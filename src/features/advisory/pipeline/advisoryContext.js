import { formatDateISO } from "../utils/shared/helpers.js";
import {
  describeAdvisoryGeometry,
  resolveAdvisoryApiGeometry,
} from "../../../utils/geometry/farmGeometry.js";

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
 * @property {import('mongoose').Types.ObjectId | string | null} cropInstanceId
 * @property {Record<string, unknown> | null} cropInstance
 * @property {string} nowISO
 * @property {string} sowingDateISO
 * @property {object | null} geometry
 * @property {object | null} fullGeometry
 * @property {{ sampled: boolean, farmAreaHa: number|null, sampleHa: number|null } | null} geometryMeta
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
  cropInstance = null,
  geometryId,
  language,
  platform,
  lightweight = false,
  preferShortHistoricalWindow = false,
  logStep = () => {},
}) {
  const now = new Date();
  const nowISO = formatDateISO(now);

  // Multi-crop: every downstream module keeps reading crop identity/dates
  // off `farmFieldDoc` exactly as before — we just overlay the specific
  // crop instance's own name/variety/start date on top of the farm doc, so
  // the same pipeline naturally produces a crop-specific advisory without
  // any module needing to know about `cropInstance` itself.
  const farmFieldDoc = cropInstance
    ? {
        ...farmField,
        cropName: cropInstance.cropName,
        variety: cropInstance.variety,
        sowingDate: cropInstance.startDate,
      }
    : farmField;
  const sowingDateISO = formatDateISO(farmFieldDoc.sowingDate || now);
  const apiGeometry = resolveAdvisoryApiGeometry(farmField);
  logStep(`geometry: ${describeAdvisoryGeometry(apiGeometry)}`);

  return {
    mode,
    farmFieldId: String(farmField._id),
    cropInstanceId: cropInstance?._id ? String(cropInstance._id) : null,
    cropInstance,
    geometryId,
    language: language || "en",
    platform: platform || "whatsapp",
    lightweight: Boolean(lightweight),
    preferShortHistoricalWindow: Boolean(preferShortHistoricalWindow),
    farmField: farmField._id,
    farmFieldDoc,
    nowISO,
    sowingDateISO,
    geometry: apiGeometry.geometry,
    fullGeometry: apiGeometry.fullGeometry,
    geometryMeta: {
      sampled: apiGeometry.sampled,
      farmAreaHa: apiGeometry.farmAreaHa,
      sampleHa: apiGeometry.sampleHa,
    },
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
