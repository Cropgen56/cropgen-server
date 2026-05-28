const ACRES_PER_HECTARE = 2.47105;

function round1(value) {
  return Number((Number(value) || 0).toFixed(1));
}

export function acresToHectares(acre) {
  return round1((Number(acre) || 0) / ACRES_PER_HECTARE);
}

function nutrientLine(kgPerHa, acre) {
  const safeAcre = Number(acre) || 0;
  const perHa = round1(kgPerHa);
  const perAcre = round1(perHa / ACRES_PER_HECTARE);
  const totalForFieldKg = round1(perAcre * safeAcre);
  return { kgPerHa: perHa, kgPerAcre: perAcre, totalForFieldKg };
}

export function buildAreaBreakdown(perHaNpk, acre) {
  const nitrogen = nutrientLine(perHaNpk?.nitrogenKgPerHa, acre);
  const phosphorous = nutrientLine(perHaNpk?.phosphorousKgPerHa, acre);
  const potassium = nutrientLine(perHaNpk?.potassiumKgPerHa, acre);

  return {
    unit: "kg",
    area: {
      acre: round1(acre),
      hectare: acresToHectares(acre),
    },
    nutrients: { nitrogen, phosphorous, potassium },
    totals: {
      perHa: round1(
        nitrogen.kgPerHa + phosphorous.kgPerHa + potassium.kgPerHa,
      ),
      perAcre: round1(
        nitrogen.kgPerAcre + phosphorous.kgPerAcre + potassium.kgPerAcre,
      ),
      totalForFieldKg: round1(
        nitrogen.totalForFieldKg +
          phosphorous.totalForFieldKg +
          potassium.totalForFieldKg,
      ),
    },
  };
}
