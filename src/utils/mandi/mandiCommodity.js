/**
 * NOTE: keep in sync with cropgen-app/src/utils/mandiCommodity.js — the app
 * uses it to look up a single crop's prices, the server uses it to work out
 * which catalog crops are traded in mandis at all (see mandiTraded.service.js).
 */
/**
 * Maps CropGen crop names to the commodity names used by the Agmarknet
 * "current daily price" dataset on data.gov.in. The dataset only matches
 * its own names (e.g. "Bhindi(Ladies Finger)", "Paddy(Dhan)(Common)"),
 * so a crop like "amaranth (grain)" or "okra" finds nothing without this.
 *
 * Keys are lowercase crop names (also tried with any "(...)" removed).
 * Values are tried in order until one returns records.
 * Checked against the live API on 2026-11-02: Wheat, Onion, Tomato,
 * Amaranthus. The rest follow Agmarknet's published names.
 */
const COMMODITY_ALIASES = {
  // grains & millets
  // Agmarknet "Amaranthus" is the leafy vegetable; grain amaranth is "Rajgir".
  amaranth: ['Amaranthus'],
  'amaranth (grain)': ['Rajgir'],
  'amaranth (leafy)': ['Amaranthus'],
  rice: ['Paddy(Dhan)(Common)', 'Rice'],
  paddy: ['Paddy(Dhan)(Common)'],
  sorghum: ['Jowar(Sorghum)'],
  jowar: ['Jowar(Sorghum)'],
  'pearl millet': ['Bajra(Pearl Millet/Cumbu)'],
  pearlmillet: ['Bajra(Pearl Millet/Cumbu)'],
  bajra: ['Bajra(Pearl Millet/Cumbu)'],
  'finger millet': ['Ragi (Finger Millet)'],
  fingermillet: ['Ragi (Finger Millet)'],
  ragi: ['Ragi (Finger Millet)'],
  barley: ['Barley (Jau)'],
  'foxtail millet': ['Foxtail Millet(Navane)'],
  'kodo millet': ['Kodo Millet(Varagu)'],
  // pulses
  chickpea: ['Bengal Gram(Gram)(Whole)'],
  gram: ['Bengal Gram(Gram)(Whole)'],
  'red gram': ['Arhar (Tur/Red Gram)(Whole)'],
  redgram: ['Arhar (Tur/Red Gram)(Whole)'],
  'pigeon pea': ['Arhar (Tur/Red Gram)(Whole)'],
  tur: ['Arhar (Tur/Red Gram)(Whole)'],
  'green gram': ['Green Gram (Moong)(Whole)'],
  greengram: ['Green Gram (Moong)(Whole)'],
  moong: ['Green Gram (Moong)(Whole)'],
  'black gram': ['Black Gram (Urd Beans)(Whole)'],
  blackgram: ['Black Gram (Urd Beans)(Whole)'],
  urad: ['Black Gram (Urd Beans)(Whole)'],
  lentil: ['Lentil (Masur)(Whole)'],
  'horse gram': ['Kulthi(Horse Gram)', 'Horse Gram'],
  horsegram: ['Kulthi(Horse Gram)', 'Horse Gram'],
  kulthi: ['Kulthi(Horse Gram)', 'Kulthi'],
  cowpea: ['Cowpea (Lobia/Karamani)', 'Cowpea(Veg)'],
  'field pea': ['Peas(Dry)', 'Field Pea'],
  fieldpea: ['Peas(Dry)', 'Field Pea'],
  peas: ['Peas Wet', 'Peas(Dry)'],
  'kidney bean': ['Rajma'],
  rajma: ['Rajma'],
  'moth bean': ['Moath Dal'],
  // oilseeds & cash crops
  soybean: ['Soyabean'],
  sesame: ['Sesamum(Sesame,Gingelly,Til)'],
  til: ['Sesamum(Sesame,Gingelly,Til)'],
  castor: ['Castor Seed'],
  niger: ['Niger Seed (Ramtil)'],
  coconut: ['Coconut', 'Tender Coconut', 'Copra'],
  cashew: ['Cashewnuts'],
  arecanut: ['Arecanut(Betelnut/Supari)'],
  'black pepper': ['Black pepper'],
  cardamom: ['Cardamoms'],
  // vegetables & spices
  okra: ['Bhindi(Ladies Finger)'],
  "lady's finger": ['Bhindi(Ladies Finger)'],
  bhindi: ['Bhindi(Ladies Finger)'],
  chilli: ['Green Chilli', 'Dry Chillies'],
  'green chilli': ['Green Chilli'],
  'red chilli': ['Dry Chillies', 'Chili Red'],
  ginger: ['Ginger(Green)', 'Ginger(Dry)'],
  coriander: ['Coriander(Leaves)', 'Corriander seed'],
  fenugreek: ['Methi(Leaves)', 'Methi Seeds'],
  methi: ['Methi(Leaves)'],
  cucumber: ['Cucumbar(Kheera)'],
  'bottle gourd': ['Bottle gourd'],
  'bitter gourd': ['Bitter gourd'],
  'ridge gourd': ['Ridgeguard(Tori)'],
  'snake gourd': ['Snakeguard'],
  'ivy gourd': ['Little gourd (Kundru)'],
  drumstick: ['Drumstick'],
  watermelon: ['Water Melon'],
  // fruits
  amla: ['Amla(Nelli Kai)'],
  'indian gooseberry': ['Amla(Nelli Kai)'],
  almond: ['Almond(Badam)'],
  'sweet lime': ['Mousambi(Sweet Lime)'],
  mosambi: ['Mousambi(Sweet Lime)'],
  sapota: ['Sapota'],
  chikoo: ['Sapota'],
  'custard apple': ['Custard Apple (Sharifa)'],
};

const titleCase = s =>
  s.replace(/\w\S*/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());

/**
 * Commodity names to try for a crop, most likely first (deduplicated).
 * An alias for the exact name (e.g. "amaranth (grain)") is authoritative:
 * only those names are tried, so a grain never shows a vegetable's prices.
 * Otherwise: aliases for the name without "(...)", the name as stored, then
 * the simplified name in Title Case.
 */
export const commodityCandidates = cropName => {
  const raw = String(cropName || '').trim();
  if (!raw) {
    return [];
  }
  const lower = raw.toLowerCase();
  const base = lower.replace(/\s*\([^)]*\)\s*/g, ' ').replace(/\s+/g, ' ').trim();
  const list = COMMODITY_ALIASES[lower]
    ? [...COMMODITY_ALIASES[lower]]
    : [...(COMMODITY_ALIASES[base] || []), raw, titleCase(base)];
  const seen = new Set();
  return list.filter(name => {
    const key = name.toLowerCase();
    if (!name || seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
};
