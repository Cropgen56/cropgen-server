/**
 * Satellite pipeline helpers: vegetation/water timeseries parsing + optical index summaries.
 * Order in advisory flow: timeseries → availability date → /calculate/index → summaries here.
 */
export {
  parseNDVIMetrics,
  parseWaterMetrics,
  getLatestVegetationTimeseriesDate,
} from "./vegWaterParsers.js";
export { summarizeIndexImageLegend, buildOpticalIndicesSummary } from "./opticalIndexSummary.js";
