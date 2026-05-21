import { normalizeTypeOfFarming } from "../../shared/farmingTypeNormalize.js";

/**
 * SPRAY DECISION ENGINE — CropGen Precision Agriculture
 * 
 * Decision hierarchy:
 * 1. Weather gate (wind, rain) — blocks spray regardless of farming type
 * 2. Harvest stage — no spray
 * 3. Detect actual disease/pest risk from conditions
 * 4. Apply farming type to select product
 * 
 * WRONG: Organic = always no spray
 * CORRECT: Organic = different products (bio-pesticides allowed)
 */

// Disease risk models by weather + stage
function assessDiseaseRisk(evidence) {
  const weather = evidence?.weatherForecast;
  const bbchStage = evidence?.bbchStage ?? 0;
  const cropType = (evidence?.cropType ?? "").toLowerCase();

  const humidity = weather?.current?.humidity ?? 60;
  const temp = weather?.current?.temp ?? 25;
  const rainfall = Array.isArray(weather?.next7Days?.rainfall)
    ? (weather.next7Days.rainfall[0] ?? 0) : 0;
  const stressZones = evidence?.stressZones ?? {};
  const diseasePressure = stressZones?.diseasePressure ?? "low";

  const riskFactors = [];

  // Fungal disease conditions: high humidity + moderate temp
  if (humidity > 78 && temp >= 18 && temp <= 30) {
    riskFactors.push({
      type: "FUNGAL",
      severity: humidity > 88 ? "HIGH" : "MODERATE",
      disease: getFungalDiseaseForCrop(cropType, bbchStage),
      molecule: getFungalMolecule(cropType, humidity, temp),
    });
  }

  // Sucking pest pressure: hot + dry conditions
  if (temp > 32 && humidity < 55) {
    riskFactors.push({
      type: "SUCKING_PEST",
      severity: temp > 38 ? "HIGH" : "MODERATE",
      disease: "Thrips / Mites / Whitefly",
      molecule: getSuckingPestMolecule(cropType),
    });
  }

  // Leaf miner / caterpillar: BBCH 30–70
  if (bbchStage >= 30 && bbchStage <= 70 && diseasePressure === "high") {
    riskFactors.push({
      type: "LEAF_PEST",
      severity: "MODERATE",
      disease: "Leaf miner / Caterpillar",
      molecule: getLeafPestMolecule(cropType),
    });
  }

  // Blight/Downy mildew: post-rain + humid
  if (rainfall > 5 && humidity > 75) {
    riskFactors.push({
      type: "BLIGHT",
      severity: "HIGH",
      disease: getBlightForCrop(cropType),
      molecule: getBlightMolecule(cropType),
    });
  }

  return riskFactors;
}

function getFungalDiseaseForCrop(crop, bbch) {
  if (crop.includes("tomato") || crop.includes("chilli")) return "Early Blight / Alternaria";
  if (crop.includes("grapes") || crop.includes("grape")) return "Powdery Mildew / Downy Mildew";
  if (crop.includes("wheat") || crop.includes("barley")) return "Rust (Yellow/Brown)";
  if (crop.includes("cotton")) return "Alternaria Leaf Spot";
  if (crop.includes("sugarcane")) return "Red Rot / Smut";
  if (crop.includes("soybean") || crop.includes("soya")) return "Anthracnose / Stem Rot";
  if (crop.includes("banana")) return "Sigatoka / Panama Wilt";
  return "Fungal Leaf Spot";
}

function getBlightForCrop(crop) {
  if (crop.includes("tomato") || crop.includes("potato")) return "Late Blight (Phytophthora)";
  if (crop.includes("pearl millet") || crop.includes("bajra")) return "Downy Mildew";
  if (crop.includes("soybean")) return "Phytophthora Root Rot";
  return "Downy Mildew / Blight";
}

function getFungalMolecule(crop, humidity, temp) {
  // Molecule selection based on pathogen type and crop
  if (crop.includes("grapes")) {
    return {
      chemical: {
        name: "Azoxystrobin 23% SC",
        dose: "1 ml/litre, 200 litre/acre",
        pumpAction: "knapsack or power sprayer",
      },
      organic: {
        name: "Trichoderma viride 1.5% WP + Sulfur 80% WDG",
        dose: "Trichoderma 5 g/litre + Sulfur 3 g/litre, 200 litre/acre",
        pumpAction: "foliar",
      },
    };
  }
  if (humidity > 85) {
    return {
      chemical: {
        name: "Mancozeb 75% WP + Metalaxyl 8% WP",
        dose: "Mancozeb 2 g/litre + Metalaxyl 1 g/litre, 200 litre/acre",
        pumpAction: "power sprayer",
      },
      organic: {
        name: "Copper Oxychloride 50% WP (OMRI listed)",
        dose: "3 g/litre, 200 litre/acre",
        pumpAction: "foliar",
      },
    };
  }
  return {
    chemical: {
      name: "Propiconazole 25% EC",
      dose: "1 ml/litre, 200 litre/acre",
      pumpAction: "knapsack sprayer",
    },
    organic: {
      name: "Neem Oil 10000 PPM + Bacillus subtilis",
      dose: "Neem 5 ml/litre + Bacillus 2 g/litre, 200 litre/acre",
      pumpAction: "foliar",
    },
  };
}

function getBlightMolecule(crop) {
  if (crop.includes("tomato") || crop.includes("potato")) {
    return {
      chemical: {
        name: "Cymoxanil 8% + Mancozeb 64% WP",
        dose: "2.5 g/litre, 200 litre/acre",
        pumpAction: "power sprayer, high volume",
      },
      organic: {
        name: "Copper Hydroxide 77% WP + Bacillus subtilis WP",
        dose: "Copper 3 g/litre + Bacillus 2 g/litre",
        pumpAction: "foliar",
      },
    };
  }
  return {
    chemical: {
      name: "Metalaxyl 35% WS",
      dose: "2 g/litre, 200 litre/acre",
      pumpAction: "foliar spray",
    },
    organic: {
      name: "Pseudomonas fluorescens 2% WP",
      dose: "5 g/litre, 200 litre/acre",
      pumpAction: "foliar",
    },
  };
}

function getSuckingPestMolecule(crop) {
  const isVegetable = crop.includes("tomato") || crop.includes("chilli") || crop.includes("okra");
  return {
    chemical: {
      name: isVegetable ? "Imidacloprid 17.8% SL" : "Thiamethoxam 25% WG",
      dose: isVegetable ? "0.5 ml/litre, 200 litre/acre" : "0.5 g/litre, 200 litre/acre",
      pumpAction: "foliar spray, morning or evening",
    },
    organic: {
      name: "Neem Oil 10000 PPM 3% EC",
      dose: "5 ml/litre, 200 litre/acre",
      pumpAction: "foliar spray, evening preferred",
    },
  };
}

function getLeafPestMolecule(crop) {
  return {
    chemical: {
      name: "Spinosad 45% SC",
      dose: "0.3 ml/litre, 200 litre/acre",
      pumpAction: "foliar, morning",
    },
    organic: {
      name: "Beauveria bassiana 1.15% WP + Neem Oil 10000 PPM",
      dose: "Beauveria 5 g/litre + Neem 3 ml/litre, 200 litre/acre",
      pumpAction: "foliar, evening",
    },
  };
}

export function getSprayDecision(evidence) {
  const typeOfFarming = normalizeTypeOfFarming(evidence?.typeOfFarming);
  const weather = evidence?.weatherForecast;
  const bbchStage = evidence?.bbchStage ?? 0;

  const windSpeed = weather?.windSpeedToday ?? weather?.current?.windSpeed ?? 0;
  const rainfallNext24h = Array.isArray(weather?.next7Days?.rainfall)
    ? (weather.next7Days.rainfall[0] ?? 0) : 0;
  const rainLikely = weather?.rainProbabilityToday === "likely";
  const rainHigh = rainfallNext24h > 10;

  // WEATHER GATE — blocks all spray regardless of farming type
  if (windSpeed > 15) {
    return {
      shouldSpray: false,
      reason: `Wind speed ${windSpeed} km/h — too high for spray. Wait for calm conditions (<15 km/h).`,
      hint: null,
    };
  }

  if (rainLikely || rainHigh) {
    return {
      shouldSpray: false,
      reason: `Rain expected (${rainfallNext24h} mm in 24h). Skip spray — product will wash off. Schedule after 48h rain-free window.`,
      hint: null,
    };
  }

  // Harvest stage — minimal spray
  if (bbchStage >= 85) {
    return {
      shouldSpray: false,
      reason: "Maturity/harvest stage. Avoid spray — maintain pre-harvest interval (PHI).",
      hint: null,
    };
  }

  // Disease/pest risk assessment
  const riskFactors = assessDiseaseRisk(evidence);

  if (riskFactors.length === 0) {
    const cropHealth = evidence?.cropHealth;
    const healthIndicatesStress =
      cropHealth?.category === "Moderate" ||
      cropHealth?.category === "Poor" ||
      cropHealth?.category === "Critical";

    if (!healthIndicatesStress) {
      return {
        shouldSpray: false,
        reason: "Crop health stable. No disease/pest risk detected. No spray needed.",
        hint: null,
      };
    }
  }

  // Build spray recommendations per farming type
  const primaryRisk = riskFactors[0] || {
    type: "PREVENTIVE",
    severity: "LOW",
    disease: "Preventive protection",
    molecule: getFungalMolecule(evidence?.cropType ?? "", 70, 25),
  };

  const isOrganic = typeOfFarming === "Organic";
  const isChemOk = typeOfFarming === "Inorganic" ||
    (typeOfFarming === "Integrated" && (primaryRisk.severity === "HIGH" || riskFactors.length > 1));
  const useOrganic = isOrganic || (typeOfFarming === "Integrated" && primaryRisk.severity !== "HIGH");

  const selectedMolecule = primaryRisk.molecule;
  const product = useOrganic
    ? selectedMolecule?.organic
    : selectedMolecule?.chemical;

  const sprayProducts = [];
  if (product) {
    sprayProducts.push({
      name: product.name,
      category: isOrganic ? "ORGANIC" : isChemOk ? "CHEMICAL" : "ORGANIC",
      target: primaryRisk.disease,
      dose: product.dose,
      applicationMethod: product.pumpAction || "Foliar spray",
      timing: "Morning 6–9 AM or Evening 4–6 PM",
      waterPerAcre: "200 litre",
    });
  }

  // Add second product if multiple risks
  if (riskFactors.length > 1 && !isOrganic) {
    const secondRisk = riskFactors[1];
    const secondMolecule = secondRisk.molecule;
    const secondProduct = useOrganic ? secondMolecule?.organic : secondMolecule?.chemical;
    if (secondProduct && secondProduct.name !== product?.name) {
      sprayProducts.push({
        name: secondProduct.name,
        category: isOrganic ? "ORGANIC" : "CHEMICAL",
        target: secondRisk.disease,
        dose: secondProduct.dose,
        applicationMethod: secondProduct.pumpAction || "Foliar spray",
        timing: "Apply after 3-day gap from first spray",
        waterPerAcre: "200 litre",
        note: "Do not mix with first product unless compatibility confirmed",
      });
    }
  }

  const riskSummary = riskFactors.map((r) => `${r.disease} (${r.severity})`).join(", ");

  return {
    shouldSpray: true,
    reason: `Spray required: ${riskSummary}.`,
    riskFactors,
    products: sprayProducts,
    hint: {
      primaryProduct: product?.name ?? "Neem Oil 10000 PPM",
      dose: product?.dose ?? "5 ml/litre, 200 litre/acre",
      timing: "Morning 6–9 AM or Evening 4–6 PM",
      weatherCondition: `Temp: ${weather?.current?.temp ?? "N/A"}°C, Humidity: ${weather?.current?.humidity ?? "N/A"}%`,
      safetyNote: "Wear PPE: gloves, mask, goggles. Avoid spray during pollinator activity.",
      preHarvestInterval: bbchStage > 70 ? "Check PHI label before spraying" : "",
    },
  };
}
