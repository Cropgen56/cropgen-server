/**
 * Evidence layer: fuse weather + satellite + NPK + growth into structured context
 * and deterministic decision hints (irrigation, spray, fertigation, monitoring).
 */
export { buildEvidence } from "./evidenceBuilder.js";
export { calculateIrrigationRequirement, soilMoistureToPercent } from "./irrigationCalculator.js";
export { calculateFertilizerSchedule } from "./fertilizerCalculator.js";
export { runDecisionEngine } from "./decisionEngine/index.js";
