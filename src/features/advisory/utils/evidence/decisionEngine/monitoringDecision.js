/**
 * MONITORING DECISION ENGINE
 * Stage-aware, stress-zone specific, crop-specific monitoring
 */

function getCropSpecificChecks(cropType, bbchStage) {
  const crop = (cropType || "").toLowerCase();

  if (crop.includes("tomato") || crop.includes("chilli")) {
    if (bbchStage >= 40 && bbchStage <= 70) {
      return {
        focusAreas: ["flower clusters", "leaf undersides", "stem base"],
        whatToCheck: "Flower drop, TSWV symptoms (bronze spots), fruit borer entry holes, leaf curl virus",
        alertSymptoms: ">10% flower drop, curled yellowing leaves, pinhead holes in fruit",
      };
    }
    return {
      focusAreas: ["lower leaves", "stem", "root collar"],
      whatToCheck: "Damping off, early blight spots on lower leaves, aphid colonies on growing tips",
      alertSymptoms: "Brown stem lesions, yellow/brown leaf spots, sticky residue on leaves",
    };
  }

  if (crop.includes("cotton")) {
    return {
      focusAreas: ["boll development zones", "leaf undersides", "square/boll drop area"],
      whatToCheck: "Pink bollworm entry holes in squares, leaf reddening (Mg deficiency), whitefly colonies, sucking pest honeydew",
      alertSymptoms: ">5% square/boll shedding, red leaf color, sticky leaves from honeydew",
    };
  }

  if (crop.includes("soybean") || crop.includes("soya")) {
    return {
      focusAreas: ["trifoliate leaves", "pods", "stem base"],
      whatToCheck: "Soybean mosaic virus (mosaic pattern), stem fly entry punctures, pod borer damage, yellow mosaic",
      alertSymptoms: "Yellow-green mosaic on leaves, circular defoliation, hollow pods",
    };
  }

  if (crop.includes("sugarcane")) {
    return {
      focusAreas: ["internode", "leaf sheath", "ratoon growth"],
      whatToCheck: "Top borer infestation (dead heart), red rot discoloration in nodes, smut whips, stem borer holes",
      alertSymptoms: "Dead central shoot, red discoloration in cross-section, black whip-like smut",
    };
  }

  if (crop.includes("wheat") || crop.includes("barley")) {
    return {
      focusAreas: ["flag leaf", "ear/spike", "stem base"],
      whatToCheck: "Rust pustules (yellow/brown/black), powdery mildew on upper leaves, termite attack at root",
      alertSymptoms: "Orange/brown/yellow powdery pustules on leaf blades or stem",
    };
  }

  if (crop.includes("grapes") || crop.includes("grape")) {
    return {
      focusAreas: ["berry surface", "leaf undersides", "shoot tips"],
      whatToCheck: "Downy mildew (white cottony growth on leaf underside), powdery mildew (white powder on berries), thrips damage (ring spots on berries)",
      alertSymptoms: "White powdery coating on berries, angular yellow spots on leaves, shriveled berries",
    };
  }

  // Default
  return {
    focusAreas: ["lower leaves", "stem base", "new growth"],
    whatToCheck: "Yellowing, pest damage, disease spots, wilting patterns",
    alertSymptoms: "Unusual yellowing, necrotic spots, wilting in patches",
  };
}

export function getMonitoringDecision(evidence) {
  const stressZones = evidence?.stressZones ?? {};
  const zones = stressZones?.zones ?? [];
  const diseasePressure = stressZones?.diseasePressure ?? "low";
  const waterStress = stressZones?.percentageWaterStressed ?? 0;
  const nDeficit = stressZones?.percentageNitrogenDeficient ?? 0;
  const bbchStage = evidence?.bbchStage ?? 0;
  const cropType = evidence?.cropType ?? "";

  const cropChecks = getCropSpecificChecks(cropType, bbchStage);

  const priorityAlerts = [];

  if (waterStress > 30) {
    priorityAlerts.push({
      issue: "Water stress",
      percentage: waterStress,
      action: "Check if drip emitters are clogged. Verify soil moisture manually with finger test at 10cm depth.",
    });
  }

  if (nDeficit > 25) {
    priorityAlerts.push({
      issue: "Nitrogen deficiency",
      percentage: nDeficit,
      action: "Check for yellowing starting from older/lower leaves — classic N deficiency symptom. Adjust fertigation.",
    });
  }

  if (diseasePressure === "high") {
    priorityAlerts.push({
      issue: "High disease pressure",
      percentage: null,
      action: `Conditions favor disease development. Scout immediately — ${cropChecks.alertSymptoms}`,
    });
  }

  if (zones.length > 0) {
    zones.forEach((z) => {
      priorityAlerts.push({
        issue: z.direction ?? "Stress detected",
        zone: z.zone,
        action: z.reason,
      });
    });
  }

  const primaryMessage = priorityAlerts.length > 0
    ? `Priority: ${priorityAlerts[0].issue} detected. ${priorityAlerts[0].action}`
    : `Regular scouting — check ${cropChecks.focusAreas.join(", ")} for ${cropChecks.whatToCheck}.`;

  return {
    hint: {
      zone: zones.length > 0 ? zones.map((z) => z.zone).join(", ") : "entire field",
      message: primaryMessage,
      checks: cropChecks.whatToCheck,
      focusAreas: cropChecks.focusAreas,
      alertSymptoms: cropChecks.alertSymptoms,
      priorityAlerts,
      frequency: diseasePressure === "high" ? "Daily scouting" : "Every 3–4 days",
      scoutVisit: diseasePressure === "high" || priorityAlerts.length > 2,
    },
  };
}
