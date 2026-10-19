/**
 * Crop-specific cumulative Growing Degree Days (GDD) from sowing to
 * physiological maturity — Priority #1 of the advisory agronomy review.
 *
 * WHY THIS FILE EXISTS
 * ---------------------
 * Before this change, growth-stage timing (`BBCH_STAGE_MAP` in bbchStageMap.js)
 * used ONE fixed "total GDD to maturity" per crop *category* (cereal=2400,
 * pulse=2600, oilseed=2000, vegetable=2000, fruit=3000). That means wheat,
 * rice, corn, barley, millets AND sugarcane — five agronomically very
 * different crops — were all forced through the same 2400 GDD "cereal"
 * curve, even though real season-total heat requirements range from
 * ~1500 GDD (wheat, base 0°C) to ~5000+ GDD (sugarcane, base 12°C, a
 * 10-18 month crop). This produced systematically wrong BBCH-stage /
 * maturity timing for anything that wasn't "average" for its category.
 *
 * This table gives each ANNUAL/single-season crop its own realistic
 * season-total GDD, consistent with that same crop's base temperature in
 * cropBaseTemperature.js. `getCropStageCurve()` in gddCalculator.js uses it
 * to rescale the category's BBCH stage curve onto the crop's own total —
 * see the comment there for exactly how.
 *
 * AGRONOMIC ASSUMPTIONS
 * ----------------------
 * - Values are indicative season totals for a typical, non-stressed,
 *   adequately-irrigated crop under normal sowing-window conditions —
 *   compiled from commonly published agronomic GDD/maturity-duration
 *   references, cross-checked against each crop's base temperature and
 *   typical days-to-maturity so the two stay internally consistent
 *   (GDD ≈ (mean season temp − base temp) × days-to-maturity).
 * - These are estimates for advisory purposes, not a substitute for
 *   region/variety-calibrated agromet data. Treat as a v1 approximation to
 *   replace the previous (worse) shared-category constant, not as ground
 *   truth — a good candidate for future calibration against real harvest
 *   dates per crop/region.
 *
 * SCOPE: ANNUAL / SINGLE-SEASON FIELD CROPS ONLY
 * ------------------------------------------------
 * A "GDD to maturity from sowing" is only a meaningful, well-defined number
 * for a crop that is (a) sown from seed/sett each season and (b) harvested
 * once at the end of that season. Many crops in CROP_PROFILES do NOT fit
 * that pattern, so they are deliberately left OUT of this table:
 *
 *   - Perennial trees/vines/plantation crops (mango, grapes, coconut,
 *     coffee, all newly-added stone fruits/nuts, etc.) — planted once,
 *     harvested across many years. "Days since sowingDate" does not map to
 *     one annual maturity cycle for these.
 *   - Multi-cut forage (lucerne/alfalfa, berseem, napier grass, feed
 *     sorghum, generic cover-crop mixes) — cut repeatedly through the
 *     season rather than maturing once.
 *   - Mushroom — grown in a controlled substrate/environment, not driven by
 *     ambient air temperature, so air-temperature GDD is not a meaningful
 *     maturity signal for it at all.
 *
 * Those crops are listed explicitly in PERENNIAL_OR_MULTI_HARVEST_CROPS
 * below (not just silently omitted) so the exclusion reads as a deliberate
 * design decision, not a data gap — and so `getCropStageCurve()` can guard
 * against ever scaling the annual model onto them, even if a value is
 * mistakenly added here later. They keep using the original, unscaled
 * per-category BBCH_STAGE_MAP curve — i.e. exactly today's behaviour.
 * Bringing proper multi-year/perennial phenology modelling to those crops
 * is a separate, larger piece of work (see advisory review Priority #2).
 */

/** Cumulative GDD (°C·day) from sowing to physiological maturity, by crop. */
export const CROP_MATURITY_GDD = {
  /* ===================== Cereals & pseudocereals ===================== */
  wheat: 2000, // base 0°C, ~130-150 day rabi crop
  rice: 2200, // base 10°C, ~120-150 day crop
  corn: 2500, // base 8°C, grain maize full season
  barley: 1700, // base 0°C, shorter season than wheat
  pearlmillet: 1600, // base 10°C, short duration kharif crop
  sorghum: 1900, // base 10°C
  fingermillet: 1500, // base 10°C, short duration millet
  sugarcane: 5000, // base 12°C, 10-18 month crop — the clearest example of
  // why a shared "cereal" total (2400) was wrong for this crop
  jute: 1600, // base 15°C, ~120 day fibre crop
  oats: 1600, // base 0°C
  rye: 1500, // base 0°C, cold-hardy winter cereal
  triticale: 1700, // base 0°C
  teff: 1200, // base 10°C, short cycle
  buckwheat: 900, // base 5°C, very short cycle (~70-90 days)
  amaranthgrain: 1500, // base 10°C
  quinoa: 1300, // base 5°C, cool-tolerant highland crop

  /* ===================== Pulses ===================== */
  chickpea: 1600, // base 5°C, rabi pulse
  greengram: 1200, // base 10°C, short duration (~60-75 days)
  blackgram: 1200, // base 10°C
  lentil: 1400, // base 5°C, rabi pulse
  horsegram: 1300, // base 10°C
  cowpealobia: 1200, // base 10°C, short duration
  kidneybeansrajma: 1400, // base 10°C
  redgram: 2200, // base 10°C, pigeon pea — long duration (~150-180 days)
  greenpeas: 1200, // base 4°C, cool season
  beans: 1300, // base 10°C
  guarclusterbean: 1400, // base 10°C

  /* ===================== Oilseeds ===================== */
  soybean: 1600, // base 10°C
  cotton: 2400, // base 12°C, long duration (~150-180 days)
  groundnut: 1800, // base 10°C
  mustard: 1500, // base 5°C, rabi oilseed
  sunflower: 1600, // base 8°C
  sesame: 1400, // base 12°C
  linseed: 1400, // base 5°C, rabi oilseed
  castor: 2000, // base 12°C, long duration
  safflower: 1500, // base 5°C, rabi oilseed
  niger: 1400, // base 10°C
  chia: 1400, // base 10°C
  canolarapeseed: 1500, // base 5°C, cool season like mustard
  hemp: 1500, // base 5°C

  /* ===================== Vegetables (true field annuals) ===================== */
  coriander: 1400, // base 5°C
  turmeric: 2800, // base 15°C, long duration (~240-270 day) rhizome crop
  ginger: 2400, // base 15°C, long duration rhizome crop
  ashgourd: 1600, // base 15°C
  beetroot: 1300, // base 4°C
  bittergourd: 1300, // base 15°C
  bottlegourd: 1300, // base 15°C
  brinjal: 1700, // base 15°C, long continuous-harvest season
  broccoli: 1300, // base 4°C
  cabbage: 1400, // base 4°C
  capsicum: 1700, // base 10°C, long continuous-harvest season
  carrot: 1300, // base 4°C
  cauliflower: 1400, // base 4°C
  celery: 1400, // base 4°C
  cucumber: 1000, // base 12°C, short duration vine
  garlic: 1800, // base 0°C, long duration bulb crop
  onion: 1800, // base 5°C, long duration bulb crop
  lettuce: 700, // base 4°C, very short cycle
  longmelon: 1200, // base 15°C
  okra: 1300, // base 15°C
  potato: 1300, // base 7°C
  pumpkin: 1300, // base 12°C
  radish: 700, // base 4°C, very short cycle
  spinach: 600, // base 4°C, very short cycle
  spongegourd: 1300, // base 15°C
  squashmelon: 1100, // base 12°C
  summersquash: 900, // base 12°C, short duration
  sweetpotato: 1100, // base 15°C
  tomato: 1700, // base 10°C, long continuous-harvest season
  turnip: 700, // base 4°C, very short cycle
  tobacco: 1500, // base 10°C
  snakegourd: 1300, // base 15°C
  chilli: 1600, // base 15°C, long continuous-harvest season
  cumin: 1300, // base 10°C
  fenugreekmethi: 1300, // base 5°C
  sugarbeet: 2000, // base 4°C, long duration root crop

  /* ===================== Annual vine fruits ===================== */
  // Melons/watermelon are true annual cucurbit vines (seed-sown each
  // season, single harvest window) unlike the perennial tree/vine fruits
  // below, so they get a real crop-specific maturity total too.
  watermelon: 1300, // base 12°C
  muskmelon: 1200, // base 12°C
};

/**
 * Typical days from sowing to physiological maturity, per crop.
 *
 * WHY THIS TABLE EXISTS
 * -----------------------
 * The hybrid stage engine (hybridStageEngine.js) fuses THREE independent
 * signals into one BBCH estimate: the GDD signal, an NDVI-phenology signal,
 * and a plain calendar-age (days-after-sowing) signal. That calendar signal
 * used ONE fixed "typical season length" per crop *category*
 * (CATEGORY_SEASON_DAYS: cereal=125 days, fruit=200 days, etc.) — the exact
 * same shared-category flaw CROP_MATURITY_GDD fixed for the GDD signal, just
 * one level up. A 125-day category default is fine for wheat but badly wrong
 * for a ~330-day sugarcane crop still in the same "cereal" category: the
 * calendar signal would report sugarcane as almost mature after just four
 * months, and — because the hybrid engine blends all three signals together
 * — that wrong calendar signal was dragging down the now-correct
 * crop-specific GDD signal in the fused result.
 *
 * This table gives the same annual crops from CROP_MATURITY_GDD their own
 * realistic days-to-maturity instead, so the calendar signal agrees with the
 * GDD signal rather than fighting it. Values are deliberately consistent
 * with each crop's CROP_MATURITY_GDD and base temperature — i.e.
 * maturityGDD ≈ (typical mean season temperature − baseTemp) × seasonDays —
 * so the two tables describe the same crop-season, not two different ones.
 *
 * Same scope and same caveats as CROP_MATURITY_GDD: only the annual/
 * single-season crops listed there get an entry here too (enforced by
 * getCropSeasonDays() falling back to the category default for anything in
 * PERENNIAL_OR_MULTI_HARVEST_CROPS, or missing from this table).
 */
export const CROP_SEASON_DAYS = {
  /* ===================== Cereals & pseudocereals ===================== */
  wheat: 130,
  rice: 130,
  corn: 110,
  barley: 110,
  pearlmillet: 85,
  sorghum: 110,
  fingermillet: 110,
  sugarcane: 330, // long-duration crop — the main motivating example
  jute: 120,
  oats: 110,
  rye: 110,
  triticale: 115,
  teff: 100,
  buckwheat: 75,
  amaranthgrain: 100,
  quinoa: 110,

  /* ===================== Pulses ===================== */
  chickpea: 110,
  greengram: 65,
  blackgram: 70,
  lentil: 110,
  horsegram: 100,
  cowpealobia: 70,
  kidneybeansrajma: 95,
  redgram: 160,
  greenpeas: 100,
  beans: 80,
  guarclusterbean: 100,

  /* ===================== Oilseeds ===================== */
  soybean: 110,
  cotton: 165,
  groundnut: 115,
  mustard: 115,
  sunflower: 100,
  sesame: 90,
  linseed: 125,
  castor: 165,
  safflower: 125,
  niger: 100,
  chia: 100,
  canolarapeseed: 115,
  hemp: 120,

  /* ===================== Vegetables (true field annuals) ===================== */
  coriander: 100,
  turmeric: 255,
  ginger: 220,
  ashgourd: 110,
  beetroot: 100,
  bittergourd: 80,
  bottlegourd: 85,
  brinjal: 135,
  broccoli: 90,
  cabbage: 100,
  capsicum: 130,
  carrot: 100,
  cauliflower: 100,
  celery: 110,
  cucumber: 60,
  garlic: 165,
  onion: 135,
  lettuce: 60,
  longmelon: 70,
  okra: 75,
  potato: 100,
  pumpkin: 100,
  radish: 45,
  spinach: 45,
  spongegourd: 85,
  squashmelon: 70,
  summersquash: 55,
  sweetpotato: 105,
  tomato: 120,
  turnip: 50,
  tobacco: 110,
  snakegourd: 85,
  chilli: 135,
  cumin: 110,
  fenugreekmethi: 100,
  sugarbeet: 165,

  /* ===================== Annual vine fruits ===================== */
  watermelon: 95,
  muskmelon: 85,
};

/**
 * Crops intentionally excluded from CROP_MATURITY_GDD (see file header for
 * the reasoning per group). `getCropStageCurve()` checks this set FIRST —
 * before even looking for a CROP_MATURITY_GDD entry — so these crops can
 * never be scaled onto the annual model, even by future accident.
 */
export const PERENNIAL_OR_MULTI_HARVEST_CROPS = new Set([
  // --- Perennial fruit trees / vines ---
  "grapes",
  "banana",
  "papaya",
  "guava",
  "pomegranate",
  "orange",
  "sapota",
  "mango",
  "fig",
  "apple",
  "lemon",
  "pineapple",
  "kiwi",
  "amla",
  "dragonfruit",
  "pears",
  "peach",
  "nectarine",
  "plum",
  "apricot",
  "cherry",
  "avocado",
  "olive",
  "citrus",
  "tablegrapes",
  "winegrapes",
  "blueberry",
  "raspberry",
  "blackberry",
  "cranberry",
  "persimmon",
  "lychee",
  "rambutan",
  "durian",
  "jackfruit",
  "custardapple",
  "passionfruit",
  "starfruit",
  "datepalm",
  "cacaococoa",
  "vanilla",
  "oilpalm",

  // --- Perennial plantation / spice trees ---
  "blackpepper",
  "tea",
  "coffee",
  "coconut",
  "arecanut",
  "rubber",
  "drumstick", // moringa — perennial tree, though often cut-managed

  // --- Perennial nut trees ---
  "almond",
  "walnut",
  "cashew",
  "pistachio",
  "hazelnut",
  "chestnut",
  "brazilnut",
  "pinenut",
  "macadamianuts",
  "pecannuts",

  // --- Multi-cut forage (no single maturity point) ---
  "lucernealfalfa",
  "berseem",
  "covercrop",
  "feedsorghum",
  "napiergrass",

  // --- Controlled-environment (ambient-air GDD not meaningful) ---
  "mushroom",
]);
