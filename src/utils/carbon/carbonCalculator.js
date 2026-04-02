/**
 * Carbon Tracking Module - IPCC-based carbon accounting
 * Tracks: emissions (fertilizer, irrigation energy, diesel) and capture (crop biomass)
 */

/* IPCC Tier 1 emission factors */
const N2O_EF = 0.01; // 1% of N applied converts to N2O-N
const N2O_GWP = 298; // Global warming potential (100-yr)
const CO2_PER_KG_N = N2O_EF * N2O_GWP; // ~2.98 kg CO2-eq per kg N applied

const CO2_PER_KWH = 0.82; // India grid emission factor (kg CO2/kWh)
const CO2_PER_LITRE_DIESEL = 2.68; // kg CO2 per litre
const CARBON_FRACTION_BIOMASS = 0.45; // ~45% C in dry plant matter
const CO2_PER_KG_C = 44 / 12; // 3.67 kg CO2 per kg C

/**
 * Estimate fertilizer application emissions (IPCC Tier 1).
 * @param {Object} npkManagement - available/required from npkCalculator
 * @param {Object} nutrientDeficit - from evidence
 * @returns {number} kg CO2-eq from fertilizer
 */
function fertilizerEmissions(npkManagement, nutrientDeficit) {
  const nApplied = nutrientDeficit?.nitrogenKgPerHa ?? 0;
  if (nApplied <= 0) return 0;
  return nApplied * CO2_PER_KG_N;
}

/**
 * Estimate irrigation energy emissions.
 * @param {number} acre - field area in acres
 * @param {boolean} needsIrrigation - if irrigation was applied
 * @param {string} irrigationType - open, drip, sprinkler
 * @returns {number} kg CO2 from pump energy
 */
function irrigationEmissions(acre, needsIrrigation, irrigationType) {
  if (!needsIrrigation) return 0;
  const ha = acre / 2.471;
  // Rough: 0.5 kWh per ha per irrigation for electric pump
  const kwhPerHa = irrigationType?.toLowerCase?.().includes("drip") ? 0.3 : 0.6;
  return ha * kwhPerHa * CO2_PER_KWH;
}

/**
 * Estimate diesel pump emissions (if applicable).
 * @param {boolean} useDiesel - whether diesel pump is used
 * @param {number} acre - field area
 * @returns {number} kg CO2
 */
function dieselEmissions(useDiesel, acre) {
  if (!useDiesel) return 0;
  const ha = acre / 2.471;
  const litresPerHa = 0.5; // rough estimate
  return ha * litresPerHa * CO2_PER_LITRE_DIESEL;
}

/**
 * Estimate carbon capture from crop biomass growth.
 * Uses NDVI as proxy for biomass accumulation.
 * @param {number} ndviLatest - latest NDVI value
 * @param {number} acre - field area
 * @param {number} bbchStage - growth stage
 * @returns {number} kg CO2 captured (negative = sequestration)
 */
function biomassCapture(ndviLatest, acre, bbchStage) {
  const ha = acre / 2.471;
  if (ha <= 0) return 0;

  // When NDVI is missing (satellite data unavailable), use stage-based fallback for crops past emergence
  let effectiveNDVI = ndviLatest;
  if (effectiveNDVI == null && bbchStage > 5) {
    // Crop past early emergence (BBCH > 5): assume conservative NDVI 0.4 for biomass estimate
    effectiveNDVI = 0.4;
  }
  if (effectiveNDVI == null || effectiveNDVI < 0.15) return 0;

  // NDVI 0.15-0.3: minimal biomass; 0.3-0.8: scaling factor
  const ndviFactor = Math.max(0, (effectiveNDVI - 0.25) / 0.55);
  // Stage factor: early (0-20) low, mid (20-70) scaling, late (70+) full
  const stageFactor = Math.min(1, Math.max(0.05, bbchStage / 65));
  const dryBiomassKgPerHa = ndviFactor * stageFactor * 3500; // max ~3.5 ton/ha
  const carbonKg = (dryBiomassKgPerHa * ha * CARBON_FRACTION_BIOMASS) / 365; // daily
  return carbonKg * CO2_PER_KG_C;
}

/**
 * Calculate carbon balance for advisory.
 * @param {Object} params
 * @param {Object} params.npkManagement - NPK data
 * @param {Object} params.nutrientDeficit - N,P,K deficit
 * @param {Object} params.irrigationRequirement - needsIrrigation, etc.
 * @param {number} params.acre - field area
 * @param {string} params.irrigationType - type of irrigation
 * @param {number} params.ndviLatest - for biomass proxy
 * @param {number} params.bbchStage - growth stage
 * @param {boolean} params.useDieselPump - optional
 * @returns {Object} { emissionKgCO2, capturedKgCO2, netBalanceKgCO2 }
 */
export function calculateCarbonBalance({
  npkManagement,
  nutrientDeficit,
  irrigationRequirement,
  acre = 1,
  irrigationType = "",
  ndviLatest = null,
  bbchStage = 0,
  useDieselPump = false,
}) {
  const fertEmission = fertilizerEmissions(npkManagement, nutrientDeficit);
  const irrigEmission = irrigationEmissions(
    acre,
    irrigationRequirement?.needsIrrigation ?? false,
    irrigationType
  );
  const dieselEmission = dieselEmissions(useDieselPump, acre);

  const emissionKgCO2 = fertEmission + irrigEmission + dieselEmission;
  const capturedKgCO2 = biomassCapture(ndviLatest, acre, bbchStage);
  const netBalanceKgCO2 = capturedKgCO2 - emissionKgCO2;

  return {
    emissionKgCO2: Math.round(emissionKgCO2 * 10) / 10,
    capturedKgCO2: Math.round(capturedKgCO2 * 10) / 10,
    netBalanceKgCO2: Math.round(netBalanceKgCO2 * 10) / 10,
  };
}
