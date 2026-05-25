/* ------------------ Updated Realistic BBCH_STAGE_MAP (Fixed for Pulses like Chickpea) ------------------ */
export const BBCH_STAGE_MAP = {
  cereal: [
    { max: 200, bbch: 10, stage: "Germination", description: "Seed imbibition and sprouting" },
    { max: 600, bbch: 20, stage: "Tillering", description: "Side shoots developing" },
    { max: 1100, bbch: 30, stage: "Stem Elongation", description: "Rapid stem growth" },
    { max: 1500, bbch: 60, stage: "Flowering", description: "Flower emergence and pollination" },
    { max: 1900, bbch: 70, stage: "Grain Filling", description: "Grain formation and filling" },
    { max: 2400, bbch: 90, stage: "Maturity", description: "Physiological maturity reached" }
  ],
  pulse: [
    { max: 300, bbch: 10, stage: "Emergence", description: "Seed germination and seedling emergence" },
    { max: 800, bbch: 29, stage: "Vegetative Growth", description: "Leaf development and branching" },
    { max: 1200, bbch: 59, stage: "Bud Formation", description: "Flower buds visible" },
    { max: 1500, bbch: 65, stage: "Flowering", description: "Full flowering – critical for pod setting" },
    { max: 1900, bbch: 75, stage: "Pod Development", description: "Pods filling with seeds" },
    { max: 2400, bbch: 89, stage: "Maturity", description: "Physiological maturity – seeds hardening" },
    { max: 2600, bbch: 97, stage: "Harvest Ready", description: "Pods dry, ready for harvest" }
  ],
  oilseed: [
    { max: 300, bbch: 10, stage: "Emergence", description: "Seed germination and emergence" },
    { max: 800, bbch: 29, stage: "Vegetative Growth", description: "Rosette/leaf development" },
    { max: 1200, bbch: 60, stage: "Flowering", description: "Flower emergence" },
    { max: 1600, bbch: 70, stage: "Pod/Silique Development", description: "Pod filling" },
    { max: 2000, bbch: 90, stage: "Maturity", description: "Physiological maturity" }
  ],
  vegetable: [
    { max: 300, bbch: 10, stage: "Seedling", description: "Early seedling emergence" },
    { max: 800, bbch: 29, stage: "Vegetative", description: "Leaf and stem development" },
    { max: 1200, bbch: 60, stage: "Flowering", description: "Flower initiation and bloom" },
    { max: 1600, bbch: 70, stage: "Fruit Development", description: "Fruit setting and enlargement" },
    { max: 2000, bbch: 90, stage: "Harvest", description: "Crop ready for harvest" }
  ],
  fruit: [
    { max: 500, bbch: 10, stage: "Vegetative Growth", description: "Shoot and leaf development" },
    { max: 1200, bbch: 60, stage: "Flower Initiation", description: "Flower bud differentiation" },
    { max: 2000, bbch: 70, stage: "Fruit Development", description: "Fruit enlargement" },
    { max: 3000, bbch: 90, stage: "Maturity", description: "Physiological maturity" }
  ]
};