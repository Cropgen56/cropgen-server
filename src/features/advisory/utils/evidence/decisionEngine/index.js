import { getSprayDecision } from "./sprayDecision.js";
import { getFertigationDecision } from "./fertigationDecision.js";
import { getPGRDecision } from "./pgrDecision.js";
import { getIrrigationDecision } from "./irrigationDecision.js";
import { getMonitoringDecision } from "./monitoringDecision.js";

export function runDecisionEngine(evidence, isHarvestStage = false) {
  const spray = isHarvestStage
    ? { shouldSpray: false, reason: "Harvest stage - no spray.", hint: null }
    : getSprayDecision(evidence);

  const fertigation = isHarvestStage
    ? {
        shouldFertigate: false,
        reason: "Harvest stage - no fertigation.",
        products: [],
        hint: null,
      }
    : getFertigationDecision(evidence);

  const pgr = isHarvestStage
    ? { shouldApplyPGR: false, reason: "Harvest stage - no PGR.", hint: null }
    : getPGRDecision(evidence);

  const irrigation = getIrrigationDecision(evidence);
  const monitoring = getMonitoringDecision(evidence);

  const harvestPlanning = isHarvestStage
    ? {
        message: "Crop at maturity. Plan timely harvesting. No spray or fertilizer.",
        advice: [
          "Plan harvest when weather is dry",
          "Arrange storage and transport",
          "Check biomass carbon estimate in CARBON_TRACKING",
        ],
      }
    : null;

  return {
    spray,
    fertigation,
    pgr,
    irrigation,
    monitoring,
    harvestPlanning,
  };
}

export {
  getSprayDecision,
  getFertigationDecision,
  getPGRDecision,
  getIrrigationDecision,
  getMonitoringDecision,
};
