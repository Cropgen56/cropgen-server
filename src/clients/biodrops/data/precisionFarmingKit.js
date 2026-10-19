/** Biodrops Precision Farming Kit — Kerala crop-wise bio-input chart (Satagro.ai). */

export const BIODROPS_BOKASHI_PRODUCT = {
  productName: "BioDrops Mokashi Bokashi Bucket",
  productImageUrl: "https://m.media-amazon.com/images/I/61HumESyvlL._SL1000_.jpg",
  productSourceUrl: null,
  description: "Complete indoor composting Bokashi bucket and mixture starter.",
};

const PRODUCT_IMAGE_FALLBACK =
  "https://m.media-amazon.com/images/I/61HumESyvlL._SL1000_.jpg";

/** @type {Record<string, { productName: string, role: string, tagline: string, defaultMethod: string, productImageUrl: string, productSourceUrl: string | null }>} */
export const BIODROPS_PRODUCT_CATALOG = {
  bokashi: {
    productName: "Biodrops Bokashi Compost",
    role: "organic_matter",
    tagline: "Organic base — mix biofertilizers with Bokashi before application",
    defaultMethod: "Mix with biofertilizers and apply to moist soil",
    productImageUrl: BIODROPS_BOKASHI_PRODUCT.productImageUrl,
    productSourceUrl: null,
  },
  azospirillum: {
    productName: "Biodrops Azospirillum",
    role: "nitrogen",
    tagline: "Nitrogen fixing biofertilizer — root growth booster",
    defaultMethod: "Soil application with compost, drip, or seedling dip (10 ml/L water)",
    productImageUrl: PRODUCT_IMAGE_FALLBACK,
    productSourceUrl: null,
  },
  psb: {
    productName: "Biodrops PSB",
    role: "phosphorus",
    tagline: "Phosphate solubilizing bacteria — unlocks soil phosphorus",
    defaultMethod: "Soil 500 ml/acre, drip 1 L/acre, or seed treatment 10 ml/kg",
    productImageUrl: PRODUCT_IMAGE_FALLBACK,
    productSourceUrl: null,
  },
  kmb: {
    productName: "Biodrops KMB",
    role: "potassium",
    tagline: "Potassium mobilizing biofertilizer — better fruit size and quality",
    defaultMethod: "Soil 500 ml/acre or drip 1–2 L/acre during flowering and fruiting",
    productImageUrl: PRODUCT_IMAGE_FALLBACK,
    productSourceUrl: null,
  },
  pseudomonas: {
    productName: "Biodrops Pseudomonas",
    role: "disease_control",
    tagline: "Bio disease protection — controls soil diseases",
    defaultMethod: "Soil 1 L/acre, foliar spray 5 ml/L water, or drip 1 L/acre",
    productImageUrl: PRODUCT_IMAGE_FALLBACK,
    productSourceUrl: null,
  },
  trichoderma: {
    productName: "Biodrops Trichoderma",
    role: "fungal_control",
    tagline: "Bio fungicide and soil protector",
    defaultMethod: "Soil 1 L/acre, seed treatment 10 ml/kg, or root dip 10 ml/L water",
    productImageUrl: PRODUCT_IMAGE_FALLBACK,
    productSourceUrl: null,
  },
  vam: {
    productName: "Biodrops VAM",
    role: "root_growth",
    tagline: "Mycorrhizal root enhancer — expands root zone",
    defaultMethod: "Plantation crops 25–100 g/plant; vegetables 2 kg/acre near root zone",
    productImageUrl: PRODUCT_IMAGE_FALLBACK,
    productSourceUrl: null,
  },
};

/** @typedef {'per_acre' | 'per_plant' | 'per_tree' | 'per_vine'} DoseUnit */

/**
 * @type {Record<string, {
 *   label: string,
 *   doseUnit: DoseUnit,
 *   application: string,
 *   doses: Record<string, { amount: number, amountMax?: number, unit: string }>,
 * }>}
 */
export const KERALA_CROP_DOSAGES = {
  paddy: {
    label: "Paddy (Rice)",
    doseUnit: "per_acre",
    application: "Land preparation + 30 DAS",
    doses: {
      bokashi: { amount: 200, unit: "kg/acre" },
      azospirillum: { amount: 2, unit: "kg/acre" },
      psb: { amount: 2, unit: "kg/acre" },
      kmb: { amount: 2, unit: "kg/acre" },
      pseudomonas: { amount: 1, unit: "kg/acre" },
      trichoderma: { amount: 1, unit: "kg/acre" },
      vam: { amount: 2, unit: "kg/acre" },
    },
  },
  banana: {
    label: "Banana",
    doseUnit: "per_plant",
    application: "Planting stage + every 45 days",
    doses: {
      bokashi: { amount: 2, amountMax: 5, unit: "kg/plant" },
      azospirillum: { amount: 5, unit: "g/plant" },
      psb: { amount: 5, unit: "g/plant" },
      kmb: { amount: 5, unit: "g/plant" },
      pseudomonas: { amount: 5, unit: "g/plant" },
      trichoderma: { amount: 5, unit: "g/plant" },
      vam: { amount: 25, unit: "g/plant" },
    },
  },
  coconut: {
    label: "Coconut",
    doseUnit: "per_tree",
    application: "Every 3 months",
    doses: {
      bokashi: { amount: 10, amountMax: 15, unit: "kg/tree" },
      azospirillum: { amount: 50, unit: "g/tree" },
      psb: { amount: 50, unit: "g/tree" },
      kmb: { amount: 50, unit: "g/tree" },
      pseudomonas: { amount: 50, unit: "g/tree" },
      trichoderma: { amount: 50, unit: "g/tree" },
      vam: { amount: 100, unit: "g/tree" },
    },
  },
  ginger: {
    label: "Ginger",
    doseUnit: "per_acre",
    application: "Bed preparation + 45 days",
    doses: {
      bokashi: { amount: 300, unit: "kg/acre" },
      azospirillum: { amount: 2, unit: "kg/acre" },
      psb: { amount: 2, unit: "kg/acre" },
      kmb: { amount: 2, unit: "kg/acre" },
      pseudomonas: { amount: 1, unit: "kg/acre" },
      trichoderma: { amount: 2, unit: "kg/acre" },
      vam: { amount: 2, unit: "kg/acre" },
    },
  },
  turmeric: {
    label: "Turmeric",
    doseUnit: "per_acre",
    application: "Planting + 45 days",
    doses: {
      bokashi: { amount: 300, unit: "kg/acre" },
      azospirillum: { amount: 2, unit: "kg/acre" },
      psb: { amount: 2, unit: "kg/acre" },
      kmb: { amount: 2, unit: "kg/acre" },
      pseudomonas: { amount: 1, unit: "kg/acre" },
      trichoderma: { amount: 2, unit: "kg/acre" },
      vam: { amount: 2, unit: "kg/acre" },
    },
  },
  pepper: {
    label: "Pepper",
    doseUnit: "per_vine",
    application: "Beginning of monsoon",
    doses: {
      bokashi: { amount: 3, amountMax: 5, unit: "kg/vine" },
      azospirillum: { amount: 25, unit: "g/vine" },
      psb: { amount: 25, unit: "g/vine" },
      kmb: { amount: 25, unit: "g/vine" },
      pseudomonas: { amount: 25, unit: "g/vine" },
      trichoderma: { amount: 25, unit: "g/vine" },
      vam: { amount: 50, unit: "g/vine" },
    },
  },
  cardamom: {
    label: "Cardamom",
    doseUnit: "per_plant",
    application: "Pre-monsoon season",
    doses: {
      bokashi: { amount: 2, unit: "kg/plant" },
      azospirillum: { amount: 20, unit: "g/plant" },
      psb: { amount: 20, unit: "g/plant" },
      kmb: { amount: 20, unit: "g/plant" },
      pseudomonas: { amount: 20, unit: "g/plant" },
      trichoderma: { amount: 20, unit: "g/plant" },
      vam: { amount: 50, unit: "g/plant" },
    },
  },
  vegetables: {
    label: "Vegetables",
    doseUnit: "per_acre",
    application: "Before planting + flowering stage",
    doses: {
      bokashi: { amount: 200, unit: "kg/acre" },
      azospirillum: { amount: 2, unit: "kg/acre" },
      psb: { amount: 2, unit: "kg/acre" },
      kmb: { amount: 2, unit: "kg/acre" },
      pseudomonas: { amount: 1, unit: "kg/acre" },
      trichoderma: { amount: 1, unit: "kg/acre" },
      vam: { amount: 2, unit: "kg/acre" },
    },
  },
  tomato: {
    label: "Tomato",
    doseUnit: "per_acre",
    application: "Transplanting + flowering",
    doses: {
      bokashi: { amount: 250, unit: "kg/acre" },
      azospirillum: { amount: 2, unit: "kg/acre" },
      psb: { amount: 2, unit: "kg/acre" },
      kmb: { amount: 2, unit: "kg/acre" },
      pseudomonas: { amount: 1, unit: "kg/acre" },
      trichoderma: { amount: 1, unit: "kg/acre" },
      vam: { amount: 2, unit: "kg/acre" },
    },
  },
  jasmine: {
    label: "Jasmine",
    doseUnit: "per_plant",
    application: "Monthly",
    doses: {
      bokashi: { amount: 2, unit: "kg/plant" },
      azospirillum: { amount: 10, unit: "g/plant" },
      psb: { amount: 10, unit: "g/plant" },
      kmb: { amount: 10, unit: "g/plant" },
      pseudomonas: { amount: 10, unit: "g/plant" },
      trichoderma: { amount: 10, unit: "g/plant" },
      vam: { amount: 25, unit: "g/plant" },
    },
  },
  mango: {
    label: "Mango",
    doseUnit: "per_tree",
    application: "Before flowering",
    doses: {
      bokashi: { amount: 10, unit: "kg/tree" },
      azospirillum: { amount: 50, unit: "g/tree" },
      psb: { amount: 50, unit: "g/tree" },
      kmb: { amount: 50, unit: "g/tree" },
      pseudomonas: { amount: 50, unit: "g/tree" },
      trichoderma: { amount: 50, unit: "g/tree" },
      vam: { amount: 100, unit: "g/tree" },
    },
  },
  cashew: {
    label: "Cashew",
    doseUnit: "per_tree",
    application: "Monsoon season",
    doses: {
      bokashi: { amount: 5, amountMax: 8, unit: "kg/tree" },
      azospirillum: { amount: 25, unit: "g/tree" },
      psb: { amount: 25, unit: "g/tree" },
      kmb: { amount: 25, unit: "g/tree" },
      pseudomonas: { amount: 25, unit: "g/tree" },
      trichoderma: { amount: 25, unit: "g/tree" },
      vam: { amount: 50, unit: "g/tree" },
    },
  },
};

/** Maps normalized crop keys from farm fields to Kerala chart keys. */
export const BIODROPS_CROP_ALIASES = {
  rice: "paddy",
  paddy: "paddy",
  banana: "banana",
  coconut: "coconut",
  ginger: "ginger",
  turmeric: "turmeric",
  pepper: "pepper",
  blackpepper: "pepper",
  cardamom: "cardamom",
  tomato: "tomato",
  jasmine: "jasmine",
  mango: "mango",
  cashew: "cashew",
  vegetables: "vegetables",
  vegetable: "vegetables",
  capsicum: "vegetables",
  chilli: "vegetables",
  chili: "vegetables",
  okra: "vegetables",
  brinjal: "vegetables",
  cabbage: "vegetables",
  cauliflower: "vegetables",
};

export const BIODROPS_PRODUCT_IDS = Object.keys(BIODROPS_PRODUCT_CATALOG);
