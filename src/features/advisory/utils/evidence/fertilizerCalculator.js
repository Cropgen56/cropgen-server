import { CROP_PROFILES } from "../../../../utils/npk/cropProfiles.js";

const ACRES_PER_HA = 2.471;

function normalizeCropName(name) {
  return (name || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function kgHaToKgAcre(kgPerHa) {
  return Math.round((kgPerHa / ACRES_PER_HA) * 10) / 10;
}

function totalKgFarm(kgPerHa, acre) {
  return Math.round(kgHaToKgAcre(kgPerHa) * acre * 10) / 10;
}

const BBCH_WINDOWS = [
  { label: "early", bbchMin: 0, bbchMax: 29, splitFractions: { N: 0.3, P: 0.55, K: 0.3 } },
  { label: "vegetative", bbchMin: 30, bbchMax: 59, splitFractions: { N: 0.4, P: 0.25, K: 0.4 } },
  { label: "reproductive", bbchMin: 60, bbchMax: 100, splitFractions: { N: 0.3, P: 0.2, K: 0.3 } },
];

function pickInorganicProducts(N_kgHa, P_kgHa, K_kgHa, acre, isDrip) {
  const products = [];
  const method = isDrip ? "Drip fertigation" : "Broadcast + immediate irrigation";

  if (N_kgHa > 3) {
    const ureaDose = Math.round(N_kgHa / 0.46);
    products.push({
      name: "Urea 46%",
      quantityKgPerHa: ureaDose,
      quantityKgPerAcre: kgHaToKgAcre(ureaDose),
      totalKgFarm: totalKgFarm(ureaDose, acre),
      method,
    });
  }
  if (P_kgHa > 3) {
    const dapDose = Math.round(P_kgHa / 0.46);
    products.push({
      name: "DAP 18:46:0",
      quantityKgPerHa: dapDose,
      quantityKgPerAcre: kgHaToKgAcre(dapDose),
      totalKgFarm: totalKgFarm(dapDose, acre),
      method,
    });
  }
  if (K_kgHa > 3) {
    const mopDose = Math.round(K_kgHa / 0.6);
    products.push({
      name: "MOP 60%",
      quantityKgPerHa: mopDose,
      quantityKgPerAcre: kgHaToKgAcre(mopDose),
      totalKgFarm: totalKgFarm(mopDose, acre),
      method,
    });
  }
  if (products.length === 0) {
    const dominant = Math.max(N_kgHa, P_kgHa, K_kgHa);
    const npkDose = Math.round(dominant / 0.19);
    products.push({
      name: "NPK 19:19:19",
      quantityKgPerHa: npkDose,
      quantityKgPerAcre: kgHaToKgAcre(npkDose),
      totalKgFarm: totalKgFarm(npkDose, acre),
      method,
    });
  }
  return products;
}

function pickOrganicProducts(N_kgHa, P_kgHa, K_kgHa, acre, isDrip) {
  const products = [];
  const method = isDrip ? "Soil drench or drip application" : "Top-dress + irrigate";
  const nTotal = N_kgHa + P_kgHa + K_kgHa;
  if (nTotal > 0) {
    const vcKgHa = Math.min(
      2000,
      Math.round(Math.max(N_kgHa / 0.015, P_kgHa / 0.01, K_kgHa / 0.005)),
    );
    products.push({
      name: "Vermicompost",
      composition: "N ~1.5%, P ~1%, K ~0.5%",
      quantityKgPerHa: vcKgHa,
      quantityKgPerAcre: kgHaToKgAcre(vcKgHa),
      totalKgFarm: totalKgFarm(vcKgHa, acre),
      method,
    });
  }
  return products;
}

function pickIntegratedProducts(N_kgHa, P_kgHa, K_kgHa, acre, isDrip) {
  const chemShare = 0.5;
  const chem = pickInorganicProducts(
    N_kgHa * chemShare,
    P_kgHa * chemShare,
    K_kgHa * chemShare,
    acre,
    isDrip,
  );
  const org = pickOrganicProducts(
    N_kgHa * (1 - chemShare),
    P_kgHa * (1 - chemShare),
    K_kgHa * (1 - chemShare),
    acre,
    isDrip,
  );
  return [...org, ...chem];
}

function buildSplit(window, cropNPK, fractions, acre, farmingType, isDrip) {
  const N = Math.round(cropNPK.N * fractions.N);
  const P = Math.round(cropNPK.P * fractions.P);
  const K = Math.round(cropNPK.K * fractions.K);

  let products;
  if (farmingType === "Organic") {
    products = pickOrganicProducts(N, P, K, acre, isDrip);
  } else if (farmingType === "Inorganic") {
    products = pickInorganicProducts(N, P, K, acre, isDrip);
  } else {
    products = pickIntegratedProducts(N, P, K, acre, isDrip);
  }

  const stageLabel = {
    early: "Vegetative (BBCH 0–29)",
    vegetative: "Stem elongation (BBCH 30–59)",
    reproductive: "Flowering & grain fill (BBCH 60+)",
  };

  return {
    bbchWindow: `${window.bbchMin}–${window.bbchMax}`,
    stageLabel: stageLabel[window.label] || window.label,
    N_kgPerHa: N,
    P_kgPerHa: P,
    K_kgPerHa: K,
    products,
    timing:
      window.label === "early"
        ? "At sowing / early emergence"
        : window.label === "vegetative"
          ? "Top-dress at 30–45 DAS"
          : "Fertigation at flowering / grain initiation",
    application: isDrip
      ? "Dissolve in water; apply via drip system"
      : "Broadcast; water immediately",
  };
}

export function calculateFertilizerSchedule({
  cropName,
  bbchStage = 30,
  acre = 1,
  farmingType = "Integrated",
  irrigationType = "drip",
}) {
  const key = normalizeCropName(cropName);
  const profile = CROP_PROFILES[key];
  const cropNPK = profile?.totalNPK ?? { N: 120, P: 50, K: 40 };
  const isDrip = (irrigationType || "").toLowerCase().includes("drip");

  const splits = BBCH_WINDOWS.map((w) =>
    buildSplit(w, cropNPK, w.splitFractions, acre, farmingType, isDrip),
  );

  const annotated = splits.map((s, i) => {
    const window = BBCH_WINDOWS[i];
    let status;
    if (bbchStage > window.bbchMax) {
      status = "completed";
    } else if (bbchStage >= window.bbchMin) {
      status = "current";
    } else {
      status = "upcoming";
    }
    return { ...s, status };
  });

  const currentApplication = annotated.find((s) => s.status === "current") || null;
  const upcomingApplications = annotated.filter((s) => s.status === "upcoming");

  return {
    totalNutrients: {
      N_kgPerHa: cropNPK.N,
      P_kgPerHa: cropNPK.P,
      K_kgPerHa: cropNPK.K,
      source: "Crop nutrient removal from profile",
    },
    applications: annotated,
    currentApplication,
    upcomingApplications,
    summary: `${cropName}: Total N=${cropNPK.N}, P=${cropNPK.P}, K=${cropNPK.K} kg/ha across 3 splits. Current BBCH=${bbchStage}.`,
  };
}
